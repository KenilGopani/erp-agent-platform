import { beforeAll, describe, expect, it } from "vitest";
import { parseEnv } from "../env";
import { OdooClient } from "./client";
import { OdooRepository } from "./repository";

// Requires a running, seeded Odoo (docker compose up -d odoo && pnpm seed).
const env = parseEnv(process.env);
const client = new OdooClient({
  url: env.ODOO_URL,
  db: env.ODOO_DB,
  username: env.ODOO_USERNAME,
  password: env.ODOO_PASSWORD,
});
const repo = new OdooRepository(client);

describe("odoo integration (seeded baseline)", () => {
  beforeAll(async () => {
    await client.authenticate();
  });

  it("reports the pinned odoo version", async () => {
    expect(await client.version()).toMatch(/^18\.0/);
  });

  it("reads the seeded catalog and customers", async () => {
    const [products, customers] = await Promise.all([repo.listProducts(), repo.listCustomers()]);
    expect(products).toHaveLength(50);
    expect(customers).toHaveLength(12);
    expect(products.every((p) => p.isStorable)).toBe(true);
  });

  it("resolves a customer's pricelist and payment terms", async () => {
    const [c] = await repo.findCustomers("Ironbridge");
    expect(c).toMatchObject({ name: "Ironbridge Fabrication", paymentTerms: "45 Days" });
    expect(c!.pricelist).toMatch(/^Platinum/);
  });

  it("finds products by sku and by text", async () => {
    const [bySku] = await repo.findProducts({ sku: "plt-base-300" });
    expect(bySku).toMatchObject({ sku: "PLT-BASE-300", listPrice: 58, uom: "Units" });
    const flanges = await repo.findProducts({ query: "flange" });
    expect(flanges.map((p) => p.sku)).toEqual(["FLG-DN100", "FLG-DN50"]);
  });

  it("reports stock against open demand and incoming supply", async () => {
    const [plate] = await repo.findProducts({ sku: "PLT-BASE-300" });
    const [tube] = await repo.findProducts({ sku: "STL-TUBE-50" });
    const [levels] = await repo.getStockLevels([plate!.id]);
    expect(levels).toMatchObject({
      onHand: 12,
      reserved: 12,
      outgoing: 40,
      forecasted: -28,
      reorderPoint: 30,
    });
    const [tubeLevels] = await repo.getStockLevels([tube!.id]);
    expect(tubeLevels).toMatchObject({ onHand: 90, incoming: 300, forecasted: 390 });
  });

  it("returns supplier prices with MOQ and lead time", async () => {
    const [steel] = await repo.findProducts({ sku: "STL-SHT-2.0" });
    const prices = await repo.getSupplierPrices(steel!.id);
    expect(prices.map((s) => s.supplierName).sort()).toEqual([
      "Apex Metals Distribution",
      "Global Alloy Traders",
      "Midwest Steel Supply",
    ]);
    const midwest = prices.find((s) => s.supplierName === "Midwest Steel Supply")!;
    expect(midwest).toMatchObject({ unitPrice: 62, leadTimeDays: 7 });
    expect(midwest.minQty).toBeGreaterThan(0);
  });

  it("lists open orders by state without counting drafts", async () => {
    const [anchor] = await repo.findProducts({ sku: "FAS-ANC-M10" });
    const open = await repo.listSalesOrders({ states: ["sale"], productId: anchor!.id });
    const openQty = open
      .flatMap((o) => o.lines)
      .filter((l) => l.productId === anchor!.id)
      .reduce((sum, l) => sum + l.quantity - l.fulfilled, 0);
    expect(openQty).toBe(400);

    const drafts = await repo.listPurchaseOrders({ states: ["draft"] });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.lines[0]).toMatchObject({ quantity: 20 });
  });
});
