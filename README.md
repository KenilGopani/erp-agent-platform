# Manufacturing Ops Copilot

AI agents that quote and procure against a real ERP (Odoo), with an approval gate,
draft-only writes and measured evals. Work in progress: see [plan.md](plan.md).

**Status:** Phases 1-4 built (Odoo + seed, tools and agents, workflow and approval, web UI). Evals, observability and guardrails are deliberately deferred.

## Quick start

Requires Node 22+, pnpm, Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d odoo-db app-db
docker compose --profile init run --rm odoo-init   # one-time Odoo DB setup
docker compose up -d odoo
pnpm seed                                          # fictional manufacturer
pnpm db:migrate                                    # app database tables
pnpm test && pnpm test:integration                 # unit + live-Odoo tests
```

Odoo is then at http://localhost:8069 (login `admin` / `admin`).
`pnpm reset` restores the exact baseline. More in [docs/odoo-setup.md](docs/odoo-setup.md).

## Pinned versions

| Component  | Version                                           |
| ---------- | ------------------------------------------------- |
| Odoo       | Community 18.0 (`odoo:18.0-20261015`)             |
| PostgreSQL | 16.15 (`postgres:16.15-alpine`)                   |
| Next.js    | 16.4.3 / React 19.3.0                             |
| Zod        | 4.x                                               |
| AI SDK     | `ai` 7.x with OpenAI, Anthropic, Google providers |
| Drizzle    | 0.45 with `pg` 8                                  |

## Scripts

| Command                        | What it does                                         |
| ------------------------------ | ---------------------------------------------------- |
| `pnpm seed`                    | Idempotent seed of products, partners, stock, orders |
| `pnpm reset`                   | Drop and rebuild Odoo, then re-seed                  |
| `pnpm baseline:digest`         | Hash of the seeded data to verify reproducibility    |
| `pnpm test`                    | Unit tests (no services needed)                      |
| `pnpm test:integration`        | Tests against the running, seeded Odoo               |
| `pnpm lint` / `pnpm typecheck` | Static checks                                        |

## Web UI

```bash
pnpm db:migrate        # app database tables (once)
pnpm dev               # http://localhost:3000
```

- **/** : request box (Quote request or Check shortages) and recent runs
- **/runs/[id]** : live progress, then the proposal card with Approve / Edit / Reject.
  Approving creates a **draft** in Odoo and shows its link; nothing is ever confirmed.
- **/traces** : every run with status, model and duration; drill into the event timeline

New runs need `AGENT_MODEL` and a provider key in `.env`. To explore the UI without a key,
`pnpm demo:runs` fills the app database with runs from a scripted stand-in model (model id
`demo:scripted`). Those runs use the real tools, pricing, Odoo data and approval flow, but say
nothing about LLM quality.

## Running the agents

Set a provider key and `AGENT_MODEL` in `.env` (see `.env.example`), then:

```bash
pnpm agent:quote "Ironbridge needs 40 base plates 300x300"
pnpm agent:procure "check shortages"
```

The agent calls read tools, then submits a proposal. Prices, totals, MOQs and lead
times are computed in code from Odoo data; the model only chooses what and how much.
Nothing is written to Odoo by the agents.

## Docs

- [Odoo setup and API key](docs/odoo-setup.md)
- [Seed data and shortage scenarios](docs/seed-data.md)
- [Architecture and state machine](docs/architecture.md)
- [Decisions](docs/decisions.md)
