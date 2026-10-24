#!/usr/bin/env bash
# Initializes the Odoo database with Community modules only (no demo data).
set -euo pipefail

DB="${ODOO_DB:-odoo}"
MODULES="base,contacts,sale_management,purchase,stock"
ARGS=(--db_host="$HOST" --db_user="$USER" --db_password="$PASSWORD" -d "$DB")

odoo "${ARGS[@]}" -i "$MODULES" --without-demo=all --stop-after-init

# Set the integration user's password (default dev value: admin).
odoo shell "${ARGS[@]}" --no-http <<PY
env.ref("base.user_admin").password = "${ODOO_PASSWORD}"
env.cr.commit()
PY
echo "Odoo database '$DB' ready."
