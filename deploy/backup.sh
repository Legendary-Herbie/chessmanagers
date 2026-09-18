#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
compose() { bash "$ROOT/deploy/compose.sh" "$@"; }
for tool in docker restic flock curl; do command -v "$tool" >/dev/null; done
set -a
source "$ROOT/.env.backup"
set +a
: "${RESTIC_REPOSITORY:?Set a remote repository}"
: "${RESTIC_PASSWORD:?Set a backup password}"
case "$RESTIC_REPOSITORY" in s3:https://*|sftp:*|rest:https://*) ;; *) echo 'Use an off-server HTTPS/SFTP backup repository.' >&2; exit 1;; esac
[[ "$RESTIC_REPOSITORY" != *YOUR-* && "$RESTIC_PASSWORD" != CHANGE_ME* ]] || { echo 'Configure .env.backup first.' >&2; exit 1; }
mkdir -p "$ROOT/backups"
exec 9>"$ROOT/backups/backup.lock"
flock -n 9 || { echo 'Another backup is running.' >&2; exit 1; }
capture=$(mktemp -d "$ROOT/backups/capture.XXXXXXXX")
resume=0
finish() {
    status=$?
    trap - EXIT
    if (( resume )); then compose start app || status=1; fi
    if (( status )); then
        echo "Backup failed. Local capture retained at $capture; inspect it before retrying." >&2
        if [[ -n "${BACKUP_HEARTBEAT_URL:-}" ]]; then curl -fsS --max-time 20 "$BACKUP_HEARTBEAT_URL/fail" >/dev/null || true; fi
    fi
    exit "$status"
}
trap finish EXIT
# Verify remote credentials before interrupting the app. Initialize the repository separately.
restic snapshots --latest 1 >/dev/null
[[ -n "$(compose ps --status running -q app)" ]] || { echo 'The app must be running before capture.' >&2; exit 1; }
resume=1
compose stop app
compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$capture/database.dump"
compose run --rm --no-deps -T --entrypoint tar app -C /app/server/uploads -czf - . > "$capture/uploads.tar.gz"
compose exec -T db pg_restore --list < "$capture/database.dump" > /dev/null
tar -tzf "$capture/uploads.tar.gz" > /dev/null
date -u +%FT%TZ > "$capture/captured-at.txt"
git -C "$ROOT" rev-parse HEAD > "$capture/source-commit.txt" 2>/dev/null || true
docker inspect --format '{{.Image}}' "$(compose ps -a -q app)" > "$capture/app-image.txt"
compose start app
resume=0
# Group retention by host/tag, not randomly named capture paths.
restic backup "$capture" --host onechessclub --tag club-data
restic forget --host onechessclub --tag club-data --group-by host,tags --keep-daily 30 --keep-monthly 12 --prune
if [[ -n "${BACKUP_HEARTBEAT_URL:-}" ]]; then curl -fsS --max-time 20 "$BACKUP_HEARTBEAT_URL" >/dev/null; fi
# Delete only this successful job's known local files. Failed captures are retained.
rm -- "$capture/database.dump" "$capture/uploads.tar.gz" "$capture/captured-at.txt" "$capture/source-commit.txt" "$capture/app-image.txt"
rmdir -- "$capture"
echo 'Encrypted off-server backup completed.'
