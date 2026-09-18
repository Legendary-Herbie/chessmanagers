#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
exec docker compose --project-directory "$ROOT" --env-file "$ROOT/.env.vps" -f "$ROOT/compose.yaml" "$@"
