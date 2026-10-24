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
