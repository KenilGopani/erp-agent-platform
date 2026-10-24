# Odoo setup

The stack runs Odoo Community **18.0** (`odoo:18.0-20261015`) with Sales, Purchase,
Inventory and Contacts installed, no demo data, and no Enterprise features.

## First run

```bash
cp .env.example .env
docker compose up -d odoo-db app-db
docker compose --profile init run --rm odoo-init   # creates DB, installs modules
docker compose up -d odoo
pnpm install && pnpm seed
```

`odoo-init` is safe to re-run. To go back to the exact baseline at any time, run
`pnpm reset` (drops the Odoo database, re-initializes it and re-seeds; about a minute).

## Integration user and API key

The integration logs in as `ODOO_USERNAME` (default `admin`) with `ODOO_PASSWORD`.
For anything beyond local development, use an API key instead of the password:

1. Open http://localhost:8069 and sign in.
2. Profile (top right) → **My Profile** → **Account Security** → **New API Key**.
3. Put the key in `.env` as `ODOO_PASSWORD`. Odoo accepts API keys wherever a
   password is expected in the external API.

For least privilege, create a dedicated user with only Sales, Purchase and
Inventory access rights rather than using `admin`.

## API approach

The client talks to Odoo's external **JSON-RPC** endpoint (`POST /jsonrpc`,
`common.authenticate` then `object.execute_kw`). It is supported in 18.0. Odoo 19
introduces a newer `/json/2` API and deprecates this one, so moving past 18.0
means swapping the transport in `src/lib/odoo/client.ts` only.

## Ports

| Service | Port | Env var       |
| ------- | ---- | ------------- |
| Odoo    | 8069 | `ODOO_PORT`   |
| App DB  | 5433 | `APP_DB_PORT` |
