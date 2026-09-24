# VPS deployment and backups

The Compose stack runs one app instance, PostgreSQL 17 and Caddy on a Linux VPS. Only HTTP/HTTPS ports are public. Database, uploads and certificates have persistent named volumes; logs rotate. The app healthcheck checks HTTP and database access. Migrations run automatically on app startup.

Run `node deploy/verify.mjs` after `npm ci` for offline YAML, shell syntax and mocked backup/recovery checks. `BASH_BINARY` can override the Bash executable. These checks do not replace building and running the real containers or a real restore on the VPS.

## Configure and start

Install Docker Engine and Compose v2 using the [official instructions](https://docs.docker.com/engine/install/). Install Git, Bash, OpenSSL, curl, util-linux (flock), and [restic](https://restic.readthedocs.io/en/stable/020_installation.html). Clone the release into `/opt/onechessclub`. Run the following from that directory:

```sh
cp deploy/vps.env.example .env.vps
chmod 600 .env.vps
openssl rand -hex 32
openssl rand -hex 32
```

Set the two different generated values as `POSTGRES_PASSWORD` and `JWT_SECRET`. Leave these hex values unquoted for preflight validation. Set `APP_DOMAIN` to your hostname only, `ACME_EMAIL`, SMTP settings and an `APP_VERSION` release tag. Single-quote SMTP values containing `$` to prevent Compose interpolation. Do not print resolved Compose configuration in public logs: it includes secrets.

Point domain DNS to the VPS; publish IPv6 only if it works. Allow ports 80/443 through the provider firewall and SSH from your administration address. Do not expose PostgreSQL or the app directly. This setup assumes Caddy is the only public reverse proxy; adding a CDN requires reviewing trusted proxy settings.

```sh
bash deploy/preflight.sh
bash deploy/compose.sh build app
bash deploy/compose.sh up -d --wait --wait-timeout 300
bash deploy/compose.sh ps
```

Caddy obtains HTTPS certificates once DNS and ports work. Database TLS is disabled only for the private same-host Docker connection. Remote databases require their own TLS configuration. Verify the HTTPS `/health` page, registration and password-reset emails, an upload, and a complete Swiss/Round Robin event. Restart and confirm data remains. Monitor the public site and Docker health externally: an unhealthy status alone does not automatically restart a container.

Never run `down -v` on the live project: it removes persistent volumes. Changing `.env.vps` does not rotate an existing database user's password. Do not change the PostgreSQL major version against the existing data volume; rehearse a supported upgrade or export/restore.

A fresh deployment starts empty. Existing developer/hosted records and uploads are not imported automatically. Stop writes at the old site, capture both its database and uploads, rehearse restoration, and verify the new deployment before switching users.

## Off-server backup setup

Choose a private S3-compatible bucket or separate SFTP server outside this VPS. Keep the restic password and credentials in your password manager outside the server; losing the password prevents recovery. Use a dedicated repository for this app.

```sh
cp deploy/backup.env.example .env.backup
chmod 600 .env.backup
# Edit the remote repository, encryption password and storage credentials.
set -a
. ./.env.backup
set +a
restic init
bash deploy/backup.sh
restic snapshots
```

Initialize a new repository only once. Backup briefly stops the app to capture a consistent database and uploads pair, validates archive readability, restarts the app, then transfers the encrypted backup. Retention keeps 30 daily and 12 monthly snapshots. This is scheduled capture, not continuous PostgreSQL recovery; daily jobs can lose up to a day of work. Adjust frequency to club needs.

Set `BACKUP_HEARTBEAT_URL` to a monitoring endpoint accepting success pings and `/fail`. Configure alerts for missing daily success pings as well as explicit failures. An empty URL means no external alerts. Failed captures remain in `backups/` for investigation: monitor disk space. Local staging is plaintext with restrictive permissions; enable provider disk encryption where available. Secrets/configuration are excluded from app data backups; keep separate secure recovery copies.

After the first successful manual backup, install the daily 03:00 UTC timer:

```sh
sudo cp deploy/onechessclub-backup.service deploy/onechessclub-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now onechessclub-backup.timer
sudo systemctl list-timers onechessclub-backup.timer
sudo journalctl -u onechessclub-backup.service
```

## SMTP and Google sign-in checks

After configuring production SMTP, send a real delivery probe to an inbox you control from the running app image:

```sh
bash deploy/compose.sh exec -e SMTP_TEST_RECIPIENT=you@your-domain.example app npm run smtp:check
```

Confirm receipt rather than relying only on the SMTP acceptance response. Inspect SPF, DKIM and DMARC results, then complete registration verification and password reset through the public HTTPS site. If Google sign-in is enabled, its authorized redirect URI must exactly match `https://APP_DOMAIN/api/v1/auth/google/callback`; test both a new Google account and linking an address already registered with a password. Keep Google variables empty when OAuth is disabled.

## Site analytics

Optional site analytics use Umami Cloud or a separately hosted Umami instance with tracker version 2.18 or newer. Create a website in Umami, then set `UMAMI_SCRIPT_URL` and `UMAMI_WEBSITE_ID` in `.env.vps` before running `bash deploy/compose.sh build app`. The script URL must use HTTPS. Both values are public tracker configuration, not credentials. The build uses `APP_DOMAIN` to limit collection to the production hostname, and the server adds the tracker host to its Content Security Policy. For Umami Cloud it also allows its collection gateway. Rebuild the app after changing these values.

Umami records page views on SPA navigation automatically. The app also records three named events after successful actions: `account_created`, `email_verified`, and `club_created`. The before-send filter removes search parameters, URL fragments, custom event fields, and referrer paths before transmission; it allows only those three event names. Browser Do Not Track is respected. Do not enable session replay, user identification, or custom event fields without a separate privacy review. Validate one visit and one test account in the Umami dashboard, then exclude your own browser from reports if desired.

Analytics is optional; leaving both settings blank loads no tracker. A separately hosted frontend can set `VITE_UMAMI_SCRIPT_URL`, `VITE_UMAMI_WEBSITE_ID`, and `VITE_UMAMI_DOMAIN` at build time, and must allow the tracker origin in its own CSP.

## Production monitoring

Set the repository Actions variable `PRODUCTION_URL` to the HTTPS origin. The external GitHub Actions probe checks `/health` and warns when the certificate has fewer than 14 days remaining. Configure repository notifications so a failed scheduled workflow reaches the operator.

Use a separate dead-man heartbeat for VPS/container/disk checks:

```sh
cp deploy/monitoring.env.example .env.monitoring
chmod 600 .env.monitoring
# Set OPS_HEARTBEAT_URL, then test both the success and /fail alert paths.
bash deploy/production-monitor.sh
sudo cp deploy/onechessclub-monitor.service deploy/onechessclub-monitor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now onechessclub-monitor.timer
```

The operations heartbeat and backup heartbeat must be separate checks with separate missing-ping alerts. Docker logs are locally rotated, but centralized retention still requires choosing and configuring a provider/agent (for example the VPS provider's log service or a managed OpenTelemetry-compatible collector). Do not declare monitoring complete until an intentional app failure, backup failure, disk threshold breach, and synthetic certificate failure each reach the on-call destination.

Edit the service paths if not using `/opt/onechessclub`. Keep this checkout and parent directory writable only by trusted administrators because this job runs as root. Persistent timers catch up after downtime, potentially causing a brief daytime interruption.

## Restore rehearsal

Run monthly and before major changes:

```sh
set -a
. ./.env.backup
set +a
restic check
restic restore latest --host onechessclub --tag club-data --target ./restore
find ./restore -name database.dump
# Pass the containing capture directory from the result above:
bash deploy/restore-drill.sh /absolute/path/to/restored/capture.XXXXXXXX
```

The script uses an isolated `onechessclub-restore` Compose project and refuses existing target volumes. It starts only PostgreSQL and a temporary file-extraction container, never the app or email workers. Use only trusted backups. Compare record totals, a known tournament, rating history and uploaded files. Inspect with:

```sh
bash deploy/compose.sh -p onechessclub-restore exec db sh
bash deploy/compose.sh -p onechessclub-restore run --rm --no-deps --entrypoint ls app /app/server/uploads
```

Rehearse full application recovery separately in a private staging environment with SMTP disabled before launch. Archive extraction is not enough. After verification, remove **only the disposable restore project**:

```sh
bash deploy/compose.sh -p onechessclub-restore down -v
```

For real recovery, restore into a new environment, verify it, then switch traffic. Keep the failed environment for investigation.

## Release procedure

Run tests before releasing. Keep the old app image and source revision. Run the backup with the **old checkout and running release before changing code**, and record its snapshot ID. Check out the new release, set a new `APP_VERSION`, run preflight, build and start with `up -d --wait`. Verify HTTPS, emails and key club workflows.

Do not blindly roll back an image after migration failure: this project includes irreversible migrations. Recovery may require restoring the matching pre-release database and uploads with the old code. Avoid unattended database major upgrades and pruning the previous release image.

References: [Compose health dependencies](https://docs.docker.com/compose/how-tos/startup-order/), [Caddy HTTPS](https://caddyserver.com/docs/automatic-https), [restic repositories](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html), [restic retention](https://restic.readthedocs.io/en/stable/060_forget.html).
