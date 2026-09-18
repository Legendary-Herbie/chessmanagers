#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
command -v docker >/dev/null
docker info >/dev/null
docker compose version
# config --quiet checks interpolation without printing secrets.
bash "$ROOT/deploy/compose.sh" config --quiet
if grep -Eq 'CHANGE_ME|example\.com' "$ROOT/.env.vps"; then
    echo 'Replace the example domain, contact address and secrets in .env.vps.' >&2
    exit 1
fi
password=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ROOT/.env.vps")
jwt=$(sed -n 's/^JWT_SECRET=//p' "$ROOT/.env.vps")
[[ "$password" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'POSTGRES_PASSWORD must be 64 hex characters.' >&2; exit 1; }
[[ "$jwt" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'JWT_SECRET must be 64 hex characters.' >&2; exit 1; }
if ! grep -Eq '^SMTP_HOST=.+$' "$ROOT/.env.vps" || ! grep -Eq '^SMTP_FROM=.+$' "$ROOT/.env.vps"; then
    echo 'WARNING: SMTP is incomplete. Do not invite clubs until verification/reset email is tested.' >&2
fi
echo 'Configuration checks passed. DNS, HTTPS, email delivery and restore tests remain deployment checks.'
