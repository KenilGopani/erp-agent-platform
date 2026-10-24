import { describe, expect, it } from "vitest";
import {
  mapCustomer,
  mapProduct,
  mapPurchaseOrder,
  mapSalesOrder,
  mapStockLevel,
  mapSupplierPrice,
} from "./types";

const productRecord = {
  id: 5,
  default_code: "STL-SHT-2",
  name: "Steel sheet 2mm",
  product_tmpl_id: [50, "Steel sheet 2mm"],
  uom_id: [1, "Units"],
  lst_price: 40,
  standard_price: 25,
  is_storable: true,
  qty_available: 100,
  free_qty: 70,
  virtual_available: 60,
  incoming_qty: 10,
  outgoing_qty: 50,
};

describe("mappers", () => {
  it("maps a customer and turns false into null", () => {
    expect(
      mapCustomer({
        id: 9,
        name: "Acme",
        email: false,
        property_payment_term_id: [2, "Net 30"],
        property_product_pricelist: false,
      }),
    ).toEqual({
      id: 9,
      name: "Acme",
      email: null,
      paymentTerms: "Net 30",
      pricelistId: null,
      pricelist: null,
    });
  });

  it("maps a product", () => {
    expect(mapProduct(productRecord)).toMatchObject({
      id: 5,
      templateId: 50,
      sku: "STL-SHT-2",
      uom: "Units",
      listPrice: 40,
      cost: 25,
      isStorable: true,
    });
  });

  it("derives reserved quantity and reorder point for stock", () => {
    const level = mapStockLevel(productRecord, {
      id: 1,
      product_id: [5, "Steel"],
      product_min_qty: 80,
      product_max_qty: 200,
    });
    expect(level).toMatchObject({ onHand: 100, reserved: 30, available: 70, reorderPoint: 80 });
    expect(mapStockLevel(productRecord).reorderPoint).toBeNull();
  });

  it("maps supplier prices and rejects rows without a supplier", () => {
    const row = {
      id: 1,
      partner_id: [3, "Metals Inc"],
      product_id: false,
      product_tmpl_id: [5, "Steel"],
      price: 22.5,
      min_qty: 100,
      delay: 7,
      product_code: false,
    };
    expect(mapSupplierPrice(row)).toMatchObject({
      supplierName: "Metals Inc",
      unitPrice: 22.5,
      minQty: 100,
      leadTimeDays: 7,
      productId: null,
      productTemplateId: 5,
    });
    expect(() => mapSupplierPrice({ ...row, partner_id: false })).toThrow(/no supplier/);
  });

  it("maps sales and purchase orders with lines", () => {
    const order = {
      id: 1,
      name: "S00001",
      partner_id: [9, "Acme"],
      state: "sale",
      date_order: "2026-01-02 10:00:00",
      amount_total: 400,
      order_line: [1],
    };
    const so = mapSalesOrder(order, [
      {
        id: 1,
        order_id: [1, "S00001"],
        product_id: [5, "Steel"],
        product_uom_qty: 10,
        qty_delivered: 4,
        price_unit: 40,
        discount: 5,
      },
    ]);
    expect(so.lines[0]).toMatchObject({ quantity: 10, fulfilled: 4, discountPct: 5 });

    const po = mapPurchaseOrder({ ...order, name: "P00001", state: "purchase" }, [
      {
        id: 2,
        order_id: [1, "P00001"],
        product_id: [5, "Steel"],
        product_qty: 100,
        qty_received: 0,
        price_unit: 22,
        date_planned: "2026-02-01 00:00:00",
      },
    ]);
    expect(po.lines[0]).toMatchObject({ quantity: 100, expectedDate: "2026-02-01 00:00:00" });
  });

  it("throws on malformed records instead of passing them on", () => {
    expect(() => mapProduct({ id: 1 })).toThrow();
  });
});
