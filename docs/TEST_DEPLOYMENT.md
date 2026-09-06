# Test deployment on Render

This branch contains a Render Blueprint for a disposable test environment:

- one free Docker web service serving both the React app and Express API;
- one free PostgreSQL database connected over Render's private network;
- an automatically generated JWT secret;
- automatic schema migrations whenever the server starts; and
- a `/health` deployment health check.

## Deploy

1. Push this branch to GitHub.
2. In Render, choose **New > Blueprint** and connect the repository.
3. Select `codex/test-deployment` as the branch and apply `render.yaml`.
4. Wait for the database and web service to report healthy, then open the web
   service URL.

The application uses Render's generated public URL automatically for CORS,
email links, and same-origin authentication cookies. `VITE_API_URL` is not
needed because the frontend and API are served by the same service.

## Enable sign-in

Email verification is mandatory for password accounts. Configure either of
these after the first deployment:

### Google sign-in

Create a Google OAuth web client with this redirect URI:

`https://<your-render-hostname>/api/v1/auth/google/callback`

Then add these web-service environment variables in Render:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

### Email verification

Add the SMTP variables from `server/.env.example`. Render's free web services
block outbound ports 25, 465, and 587, so use an SMTP provider that supports an
alternative port such as 2525 and set `SMTP_PORT=2525`.

## Disposable-tier limitations

- The free PostgreSQL database expires after 30 days and has no managed backup.
- The free web service sleeps after inactivity, so the first request can be slow.
- The free web service has an ephemeral filesystem. Uploaded club logos and
  player photos disappear after a restart, sleep, or redeployment.

For longer-lived testing, upgrade PostgreSQL and the web service, then attach a
persistent disk at `/app/server/uploads`. A single instance is required while
that disk is attached.
