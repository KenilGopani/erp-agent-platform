import type { AnyToolDef } from "../define";
import type { ToolDeps } from "../deps";
import { findCustomer, findProducts } from "./catalog";
import { getPricing } from "./pricing";
import { getReplenishmentOptions, getSupplierPrices } from "./sourcing";
import { findShortages, getInventory, getOpenDemand, getOpenPurchaseOrders } from "./stock";

/** Read tools the model may call freely. None of them can change Odoo. */
export const QUOTING_TOOL_NAMES = [
  "find_customer",
  "find_products",
  "get_inventory",
  "get_open_demand",
  "get_open_purchase_orders",
  "get_supplier_prices",
  "get_pricing",
] as const;

export const PROCUREMENT_TOOL_NAMES = [
  "find_products",
  "find_shortages",
  "get_inventory",
  "get_open_demand",
  "get_open_purchase_orders",
  "get_supplier_prices",
  "get_replenishment_options",
] as const;

export function createReadTools(deps: ToolDeps): AnyToolDef[] {
  return [
    findCustomer(deps),
    findProducts(deps),
    getInventory(deps),
    getOpenDemand(deps),
    getOpenPurchaseOrders(deps),
    getSupplierPrices(deps),
    getPricing(deps),
    findShortages(deps),
    getReplenishmentOptions(deps),
  ];
}

export function pickTools(all: AnyToolDef[], names: readonly string[]) {
  return all.filter((t) => names.includes(t.name));
}
