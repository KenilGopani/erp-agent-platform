import { beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "../../env";
import { OdooClient } from "../../odoo/client";
import { OdooRepository } from "../../odoo/repository";
import { createReadTools } from "./index";
import type { AnyToolDef } from "../define";

// Requires the seeded baseline (pnpm reset).
const env = parseEnv(process.env);
const client = new OdooClient({
  url: env.ODOO_URL,
  db: env.ODOO_DB,
  username: env.ODOO_USERNAME,
  password: env.ODOO_PASSWORD,
});
const NOW = new Date("2026-01-10T00:00:00Z");
const tools = createReadTools({ repo: new OdooRepository(client), now: () => NOW });
const call = (name: string, input: unknown) =>
  tools.find((t: AnyToolDef) => t.name === name)!.execute(input);

const ids: Record<string, number> = {};
const customers: Record<string, number> = {};

beforeAll(async () => {
  const skus = [
    "PLT-BASE-300",
    "STL-TUBE-50",
    "STL-SHT-2.0",
    "AL-SHT-4.0",
    "FAS-NUT-M8",
    "SS-SHT-3.0",
    "BRK-L-100",
  ];
  for (const sku of skus) {
    const r = (await call("find_products", { sku })) as { matches: { id: number }[] };
    ids[sku] = r.matches[0]!.id;
  }
  for (const q of ["Ironbridge", "Redwood"]) {
    const r = (await call("find_customer", { query: q })) as {
      matches: { id: number; name: string }[];
    };
    customers[q] = r.matches[0]!.id;
  }
});

describe("read tools against the seeded baseline", () => {
  it("find_customer returns tier and terms, and surfaces ambiguity", async () => {
    const r = (await call("find_customer", { query: "Summit" })) as { matches: { name: string }[] };
    expect(r.matches.map((m) => m.name).sort()).toEqual([
      "Summit Hydraulics",
      "Summit Packaging Systems",
    ]);
    const one = (await call("find_customer", { query: "Ironbridge" })) as {
      matches: { pricelist: string; paymentTerms: string }[];
    };
    expect(one.matches[0]).toMatchObject({ pricelist: "Platinum", paymentTerms: "45 Days" });
    expect(await call("find_customer", { query: "Nonexistent Corp" })).toEqual({ matches: [] });
  });

  it("find_products matches words in any order", async () => {
    const r = (await call("find_products", { query: "DN100 flange" })) as {
      matches: { sku: string }[];
    };
    expect(r.matches.map((m) => m.sku)).toEqual(["FLG-DN100"]);
    const plural = (await call("find_products", { query: "base plates 300x300" })) as {
      matches: { sku: string }[];
    };
    expect(plural.matches.map((m) => m.sku)).toEqual(["PLT-BASE-300"]);
    const none = (await call("find_products", { query: "flange titanium" })) as {
      matches: unknown[];
    };
    expect(none.matches).toEqual([]);
    const c = (await call("find_customer", { query: "Fabrication Ironbridge" })) as {
      matches: { name: string }[];
    };
    expect(c.matches.map((m) => m.name)).toEqual(["Ironbridge Fabrication"]);
  });

  it("get_inventory reflects reservations and forecast", async () => {
    expect(await call("get_inventory", { productId: ids["PLT-BASE-300"] })).toMatchObject({
      onHand: 12,
      available: 0,
      forecasted: -28,
      reorderPoint: 30,
    });
  });

  it("get_open_demand counts confirmed orders only", async () => {
    const r = (await call("get_open_demand", { productId: ids["BRK-L-100"] })) as {
      totalOpenQuantity: number;
    };
    // 60 on a confirmed order; the 40 on a draft quotation must not count
    expect(r.totalOpenQuantity).toBe(60);
  });

  it("get_open_purchase_orders excludes draft RFQs", async () => {
    const tube = (await call("get_open_purchase_orders", { productId: ids["STL-TUBE-50"] })) as {
      totalIncomingQuantity: number;
    };
    expect(tube.totalIncomingQuantity).toBe(300);
    const draftOnly = (await call("get_open_purchase_orders", {
      productId: ids["SS-SHT-3.0"],
    })) as {
      totalIncomingQuantity: number;
    };
    expect(draftOnly.totalIncomingQuantity).toBe(0);
  });

  it("get_pricing applies the tier deterministically", async () => {
    const r = await call("get_pricing", {
      customerId: customers["Ironbridge"],
      productId: ids["PLT-BASE-300"],
      quantity: 40,
    });
    expect(r).toMatchObject({ listPrice: 58, unitPrice: 49.3, discountPct: 15, lineTotal: 1972 });
    const std = await call("get_pricing", {
      customerId: customers["Redwood"],
      productId: ids["PLT-BASE-300"],
      quantity: 1,
    });
    expect(std).toMatchObject({ unitPrice: 58, discountPct: 0 });
  });

  it("get_pricing reports unknown ids as tool errors", async () => {
    await expect(
      call("get_pricing", { customerId: 999999, productId: 1, quantity: 1 }),
    ).rejects.toMatchObject({
      code: "customer_not_found",
    });
  });

  it("find_shortages lists seeded shortages and omits covered products", async () => {
    const r = (await call("find_shortages", {})) as {
      shortages: { sku: string; reason: string }[];
    };
    const skus = r.shortages.map((s) => s.sku);
    for (const sku of [
      "PLT-BASE-300",
      "AL-SHT-4.0",
      "FAS-ANC-M10",
      "STL-SHT-5.0",
      "SS-SHT-3.0",
      "BRK-L-150",
    ]) {
      expect(skus).toContain(sku);
    }
    expect(skus).not.toContain("STL-TUBE-50");
    expect(skus).not.toContain("FAS-NUT-M8");
    // negative forecasts come first
    const firstNonNegative = r.shortages.findIndex((s) => s.reason !== "negative_forecast");
    expect(
      r.shortages.slice(0, firstNonNegative).every((s) => s.reason === "negative_forecast"),
    ).toBe(true);
  });

  it("get_replenishment_options does the MOQ and cost math in code", async () => {
    const r = (await call("get_replenishment_options", { productId: ids["AL-SHT-4.0"] })) as {
      needsReplenishment: boolean;
      quantityNeeded: number;
      options: {
        supplierName: string;
        orderQuantity: number;
        minQty: number;
        lineCost: number;
        unitPrice: number;
        expectedArrival: string;
        leadTimeDays: number;
      }[];
    };
    expect(r.needsReplenishment).toBe(true);
    expect(r.quantityNeeded).toBe(75); // max 60 - forecast (-15)
    for (const o of r.options) {
      expect(o.orderQuantity).toBe(Math.max(75, o.minQty));
      expect(o.lineCost).toBeCloseTo(o.orderQuantity * o.unitPrice, 2);
    }
    const apex = r.options.find((o) => o.supplierName.startsWith("Apex"))!;
    expect(apex.expectedArrival).toBe("2026-01-20"); // NOW + 10 day lead time
  });

  it("get_replenishment_options says nothing is needed for a covered product", async () => {
    const r = (await call("get_replenishment_options", { productId: ids["STL-TUBE-50"] })) as {
      needsReplenishment: boolean;
      quantityNeeded: number;
    };
    expect(r).toMatchObject({ needsReplenishment: false, quantityNeeded: 0 });
  });
});
