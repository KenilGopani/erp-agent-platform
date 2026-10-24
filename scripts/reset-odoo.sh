#!/usr/bin/env bash
# Drops the Odoo database, re-initializes it and re-seeds the baseline.
# Evals depend on this to start every run from identical data.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; . ./.env; set +a; fi
DB="${ODOO_DB:-odoo}"

echo "[reset] stopping odoo"
docker compose stop odoo >/dev/null
docker compose up -d --wait odoo-db >/dev/null 2>&1

echo "[reset] dropping database '$DB'"
docker compose exec -T odoo-db dropdb -U odoo --if-exists --force "$DB"

echo "[reset] initializing database (installs modules, takes a minute)"
docker compose --profile init run --rm odoo-init >/dev/null

echo "[reset] starting odoo"
docker compose up -d odoo >/dev/null 2>&1
for _ in $(seq 1 60); do
  curl -sf "${ODOO_URL:-http://localhost:8069}/web/login" -o /dev/null && break
  sleep 2
done

echo "[reset] seeding"
pnpm --silent seed
echo "[reset] done"
