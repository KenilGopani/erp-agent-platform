# Decisions

Choices not fixed by `plan.md`, and why.

## Odoo 18.0, JSON-RPC

18.0 supports the `/jsonrpc` external API the client uses and is a long-term
release. Odoo 19 deprecates it in favour of `/json/2`. Pinned image:
`odoo:18.0-20261015`.

## JSON-RPC over XML-RPC

Same capabilities, but `fetch` plus JSON needs no dependency and is trivial to mock.

## Writes are never retried in the client

Reads retry with backoff on transient errors. `create` and `write` do not: a lost
response could otherwise create two records. Duplicate protection for the approval
flow is handled by idempotency keys in Phase 3.

## Pricelists as discount tiers

Customer discount tiers are Odoo pricelists (Standard/Silver/Gold/Platinum) with
percentage rules, so pricing in Phase 2 can reuse Odoo's own price computation.

## Seed resets by dropping the database

`pnpm reset` drops and recreates the Odoo database instead of trying to undo
changes. It is slower (about a minute) but guarantees a bit-identical baseline.

## Local tooling

- `pnpm typecheck` runs `next typegen` first because Next 16 generates the global
  `LayoutProps` type.
- Husky hooks run lint-staged and commitlint only. Typecheck and tests run at phase
  end and in CI.

## Model submits choices, code computes numbers

Agents finish by calling `submit_result` with ids and quantities only. Prices,
discounts, totals, MOQs and lead times are computed by the proposal builders from
Odoo data, so a model cannot invent a price. Builder rejections are returned to the
model as a tool result so it can correct itself.

## Agents have no write path

The write layer (`src/lib/tools/write`) is not imported by any agent code, and
`boundary.test.ts` enforces this. Writes are idempotent per key (the key is stored in
`client_order_ref` / `partner_ref`) and create drafts only.

## Deferred by request

Evals, step-level observability and the guardrail layer (limits, price sanity) are
deferred. `src/lib/guardrails` and `src/lib/observability` exist but are not wired
into the agents.

## No real-model run yet

No provider API keys were available during development, so agents are tested with a
scripted model against the real tools and a live Odoo. Nothing here claims
real-model quality.

## Added tools beyond the plan

`find_shortages` and `get_replenishment_options` keep scanning and reorder math in
code instead of in the model.
