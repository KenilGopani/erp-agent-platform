# Manufacturing Ops Copilot

AI agents that quote and procure against a real ERP (Odoo), with an approval gate,
draft-only writes and measured evals. Work in progress: see [plan.md](plan.md).

**Status:** Phase 1 (foundation: Odoo, seed data, typed client).

## Quick start

Requires Node 22+, pnpm, Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d odoo-db app-db
docker compose --profile init run --rm odoo-init   # one-time Odoo DB setup
docker compose up -d odoo
pnpm seed                                          # fictional manufacturer
pnpm test && pnpm test:integration                 # unit + live-Odoo tests
```

Odoo is then at http://localhost:8069 (login `admin` / `admin`).
`pnpm reset` restores the exact baseline. More in [docs/odoo-setup.md](docs/odoo-setup.md).

## Pinned versions

| Component  | Version                               |
| ---------- | ------------------------------------- |
| Odoo       | Community 18.0 (`odoo:18.0-20261015`) |
| PostgreSQL | 16.15 (`postgres:16.15-alpine`)       |
| Next.js    | 16.4.3 / React 19.3.0                 |
| Zod        | 4.x                                   |

## Scripts

| Command                        | What it does                                         |
| ------------------------------ | ---------------------------------------------------- |
| `pnpm seed`                    | Idempotent seed of products, partners, stock, orders |
| `pnpm reset`                   | Drop and rebuild Odoo, then re-seed                  |
| `pnpm baseline:digest`         | Hash of the seeded data to verify reproducibility    |
| `pnpm test`                    | Unit tests (no services needed)                      |
| `pnpm test:integration`        | Tests against the running, seeded Odoo               |
| `pnpm lint` / `pnpm typecheck` | Static checks                                        |

## Docs

- [Odoo setup and API key](docs/odoo-setup.md)
- [Seed data and shortage scenarios](docs/seed-data.md)
- [Decisions](docs/decisions.md)
