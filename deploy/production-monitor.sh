#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
set -a
source "$ROOT/.env.vps"
source "$ROOT/.env.monitoring"
set +a
: "${APP_DOMAIN:?Set APP_DOMAIN in .env.vps}"
: "${OPS_HEARTBEAT_URL:?Set an external dead-man heartbeat URL}"
DISK_USAGE_LIMIT_PERCENT=${DISK_USAGE_LIMIT_PERCENT:-80}
CERTIFICATE_MIN_DAYS=${CERTIFICATE_MIN_DAYS:-14}
[[ "$DISK_USAGE_LIMIT_PERCENT" =~ ^[0-9]+$ ]] && (( DISK_USAGE_LIMIT_PERCENT >= 1 && DISK_USAGE_LIMIT_PERCENT <= 99 ))
[[ "$CERTIFICATE_MIN_DAYS" =~ ^[0-9]+$ ]] && (( CERTIFICATE_MIN_DAYS >= 1 ))

failures=()
if ! curl -fsS --max-time 20 --proto '=https' --tlsv1.2 "https://$APP_DOMAIN/health" >/dev/null; then
    failures+=('public HTTPS health check failed')
fi
if ! bash "$ROOT/deploy/compose.sh" ps --status running --services | grep -qx app; then
    failures+=('app container is not running')
fi
if ! bash "$ROOT/deploy/compose.sh" ps --status running --services | grep -qx db; then
    failures+=('database container is not running')
fi
usage=$(df -P "$ROOT" | awk 'NR==2 { gsub(/%/, "", $5); print $5 }')
if (( usage >= DISK_USAGE_LIMIT_PERCENT )); then
    failures+=("disk usage is ${usage}%")
fi
seconds=$(( CERTIFICATE_MIN_DAYS * 86400 ))
if ! openssl s_client -connect "$APP_DOMAIN:443" -servername "$APP_DOMAIN" </dev/null 2>/dev/null \
    | openssl x509 -checkend "$seconds" -noout >/dev/null; then
    failures+=("certificate expires within ${CERTIFICATE_MIN_DAYS} days")
fi

if (( ${#failures[@]} )); then
    printf 'Production monitor failed: %s\n' "${failures[*]}" >&2
    curl -fsS --max-time 20 "$OPS_HEARTBEAT_URL/fail" >/dev/null || true
    exit 1
fi
curl -fsS --max-time 20 "$OPS_HEARTBEAT_URL" >/dev/null
echo 'Production health, containers, disk and certificate checks passed.'
