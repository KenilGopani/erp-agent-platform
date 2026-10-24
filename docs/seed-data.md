# Seed data: Ridgeline Metalworks

A fictional metal-fabrication manufacturer. Everything is defined in
`scripts/seed/data.ts` and is deterministic (fixed data plus a seeded PRNG for
order history), so every reset produces the same baseline.

| Entity          | Count | Notes                                                                       |
| --------------- | ----- | --------------------------------------------------------------------------- |
| Products        | 50    | 22 raw materials, 12 fasteners, 16 finished parts, each with a reorder rule |
| Customers       | 12    | Four pricelist tiers (0/5/10/15% off, +3% at qty >= 1000), varied terms     |
| Suppliers       | 6     | 94 supplier prices with MOQ and lead time (`product.supplierinfo`)          |
| Sales orders    | 34    | 24 delivered history, 8 open, 2 draft quotations                            |
| Purchase orders | 16    | 11 received history, 4 open, 1 draft RFQ                                    |

Two customers share a first word on purpose ("Summit Packaging Systems" and
"Summit Hydraulics") to test ambiguous-customer handling.

## Deliberate scenarios

| SKU            | Situation                                                        |
| -------------- | ---------------------------------------------------------------- |
| STL-SHT-2.0    | Below reorder point; suppliers trade price/MOQ against lead time |
| STL-SHT-5.0    | Below reorder point, no incoming supply                          |
| STL-BAR-RND-30 | Below reorder point, no incoming supply                          |
| SS-SHT-3.0     | Below reorder point; only a _draft_ RFQ exists (not real supply) |
| FAS-BLT-M8X25  | Below reorder point, no incoming supply                          |
| BRK-L-150      | Below reorder point, no incoming supply                          |
| PLT-BASE-300   | Forecast -28: open sales order exceeds stock                     |
| AL-SHT-4.0     | Forecast -15: open sales order exceeds stock; MOQ edge           |
| FAS-ANC-M10    | Forecast -250: open sales order exceeds stock                    |
| STL-TUBE-50    | Below reorder point but **covered** by an open PO                |
| FAS-NUT-M8     | Below reorder point but **covered** by an open PO                |

## Verifying reproducibility

`pnpm baseline:digest` prints a SHA-256 over products, stock, supplier prices and
order lines (dates and database ids excluded). The digest is identical before and
after `pnpm reset`.
