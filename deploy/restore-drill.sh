#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
capture=${1:?Usage: bash deploy/restore-drill.sh /absolute/path/to/capture [new-project-name]}
project=${2:-onechessclub-restore}
[[ "$project" =~ ^onechessclub-restore(-[a-z0-9]+)?$ ]] || { echo 'Use onechessclub-restore or onechessclub-restore-SUFFIX.' >&2; exit 1; }
[[ -s "$capture/database.dump" && -s "$capture/uploads.tar.gz" ]] || { echo 'Both backup files are required.' >&2; exit 1; }
for volume in postgres_data uploads; do
    if docker volume inspect "${project}_${volume}" >/dev/null 2>&1; then
        echo "Refusing to overwrite existing restore volume: ${project}_${volume}" >&2
        exit 1
    fi
done
compose() { bash "$ROOT/deploy/compose.sh" -p "$project" "$@"; }
tar -tzf "$capture/uploads.tar.gz" >/dev/null
compose up -d --wait db
compose exec -T db sh -c 'pg_restore --exit-on-error --single-transaction --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$capture/database.dump"
compose run --rm --no-deps -T --entrypoint tar app -C /app/server/uploads -xzf - < "$capture/uploads.tar.gz"
compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -c "SELECT (SELECT count(*) FROM clubs) AS clubs, (SELECT count(*) FROM players) AS players, (SELECT count(*) FROM matches) AS matches;"'
echo "Restore loaded into $project. No app, email worker or public proxy was started."
echo 'Compare records and files with the source before declaring recovery successful.'
