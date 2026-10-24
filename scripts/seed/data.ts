/**
 * Static seed data for the fictional manufacturer "Ridgeline Metalworks".
 * Everything here is deterministic; nothing is random.
 */

export type Uom = "Units" | "m" | "kg";
export type Category = "raw" | "fastener" | "finished";

export interface SeedProduct {
  sku: string;
  name: string;
  category: Category;
  uom: Uom;
  cost: number;
  price: number;
  /** Reorder point (min) and order-up-to level (max). */
  min: number;
  max: number;
  /** Target on-hand quantity of the baseline. */
  stock: number;
}

const p = (
  sku: string,
  name: string,
  category: Category,
  uom: Uom,
  cost: number,
  price: number,
  min: number,
  max: number,
  stock: number,
): SeedProduct => ({ sku, name, category, uom, cost, price, min, max, stock });

export const PRODUCTS: SeedProduct[] = [
  // --- raw materials -------------------------------------------------------
  p("STL-SHT-1.5", "Steel sheet 1.5mm 1000x2000", "raw", "Units", 48, 70, 40, 150, 120),
  p("STL-SHT-2.0", "Steel sheet 2.0mm 1000x2000", "raw", "Units", 62, 90, 40, 150, 25),
  p("STL-SHT-3.0", "Steel sheet 3.0mm 1000x2000", "raw", "Units", 91, 130, 30, 120, 90),
  p("STL-SHT-5.0", "Steel sheet 5.0mm 1000x2000", "raw", "Units", 150, 210, 20, 80, 14),
  p("STL-BAR-RND-12", "Steel round bar 12mm", "raw", "m", 3.2, 5.5, 300, 1200, 800),
  p("STL-BAR-RND-20", "Steel round bar 20mm", "raw", "m", 8.1, 13, 200, 800, 520),
  p("STL-BAR-RND-30", "Steel round bar 30mm", "raw", "m", 18.5, 29, 100, 400, 60),
  p("STL-BAR-SQ-20", "Steel square bar 20mm", "raw", "m", 9.4, 15, 150, 600, 400),
  p("STL-ANG-40", "Steel angle 40x40x4", "raw", "m", 6.8, 11, 200, 800, 350),
  p("STL-TUBE-50", "Steel tube 50x50x3", "raw", "m", 11.2, 18, 150, 600, 90),
  p("SS-SHT-1.5", "Stainless 304 sheet 1.5mm", "raw", "Units", 140, 205, 15, 60, 40),
  p("SS-SHT-3.0", "Stainless 304 sheet 3.0mm", "raw", "Units", 255, 370, 10, 40, 8),
  p("SS-BAR-16", "Stainless round bar 16mm", "raw", "m", 14, 22, 100, 400, 220),
  p("SS-TUBE-25", "Stainless tube 25mm", "raw", "m", 16, 25, 80, 300, 150),
  p("AL-SHT-2.0", "Aluminum 6061 sheet 2mm", "raw", "Units", 85, 125, 25, 100, 70),
  p("AL-SHT-4.0", "Aluminum 6061 sheet 4mm", "raw", "Units", 160, 230, 15, 60, 10),
  p("AL-BAR-20", "Aluminum round bar 20mm", "raw", "m", 7.5, 12, 200, 800, 450),
  p("AL-PLATE-10", "Aluminum plate 10mm", "raw", "Units", 320, 460, 8, 30, 18),
  p("AL-EXT-40", "Aluminum extrusion 40x40", "raw", "m", 9.9, 16, 150, 600, 300),
  p("BRZ-BAR-25", "Bronze bar 25mm", "raw", "m", 32, 49, 30, 120, 55),
  p("CU-SHT-1", "Copper sheet 1mm", "raw", "Units", 210, 300, 10, 40, 22),
  p("PWD-RAL9005", "Powder coat black RAL9005", "raw", "kg", 9, 14, 100, 400, 260),

  // --- fasteners ------------------------------------------------------------
  p("FAS-BLT-M6X20", "Hex bolt M6x20", "fastener", "Units", 0.06, 0.12, 5000, 20000, 12000),
  p("FAS-BLT-M8X25", "Hex bolt M8x25", "fastener", "Units", 0.09, 0.18, 4000, 16000, 3000),
  p("FAS-BLT-M10X30", "Hex bolt M10x30", "fastener", "Units", 0.15, 0.3, 3000, 12000, 7000),
  p("FAS-BLT-M12X40", "Hex bolt M12x40", "fastener", "Units", 0.26, 0.5, 2000, 8000, 4500),
  p("FAS-NUT-M6", "Hex nut M6", "fastener", "Units", 0.03, 0.07, 6000, 24000, 15000),
  p("FAS-NUT-M8", "Hex nut M8", "fastener", "Units", 0.05, 0.1, 5000, 20000, 4200),
  p("FAS-NUT-M10", "Hex nut M10", "fastener", "Units", 0.08, 0.16, 3000, 12000, 8000),
  p("FAS-WSH-M8", "Flat washer M8", "fastener", "Units", 0.02, 0.05, 8000, 30000, 20000),
  p("FAS-WSH-M10", "Flat washer M10", "fastener", "Units", 0.03, 0.07, 6000, 24000, 9000),
  p("FAS-RIV-4", "Blind rivet 4mm", "fastener", "Units", 0.04, 0.09, 5000, 20000, 11000),
  p("FAS-SCR-SS-M5", "Stainless screw M5x16", "fastener", "Units", 0.11, 0.22, 2000, 8000, 5000),
  p("FAS-ANC-M10", "Anchor bolt M10", "fastener", "Units", 0.55, 1.1, 500, 2000, 150),

  // --- finished parts -------------------------------------------------------
  p("BRK-L-100", "Mounting bracket L 100mm", "finished", "Units", 4.1, 9.5, 100, 400, 220),
  p("BRK-L-150", "Mounting bracket L 150mm", "finished", "Units", 6.2, 14, 80, 300, 40),
  p("BRK-U-80", "U-bracket 80mm", "finished", "Units", 5.3, 12.5, 60, 250, 130),
  p("PLT-BASE-200", "Base plate 200x200", "finished", "Units", 14, 32, 50, 200, 95),
  p("PLT-BASE-300", "Base plate 300x300", "finished", "Units", 26, 58, 30, 120, 12),
  p("FLG-DN50", "Flange DN50", "finished", "Units", 18, 41, 40, 160, 85),
  p("FLG-DN100", "Flange DN100", "finished", "Units", 34, 76, 25, 100, 60),
  p("SHF-25-300", "Drive shaft 25mm x 300mm", "finished", "Units", 28, 64, 30, 120, 70),
  p("SHF-40-500", "Drive shaft 40mm x 500mm", "finished", "Units", 55, 124, 20, 80, 33),
  p("GER-SPR-20T", "Spur gear 20T", "finished", "Units", 22, 52, 40, 150, 100),
  p("GER-SPR-40T", "Spur gear 40T", "finished", "Units", 39, 90, 30, 100, 45),
  p("ENC-ALU-S", "Aluminum enclosure small", "finished", "Units", 38, 88, 30, 120, 75),
  p("ENC-ALU-L", "Aluminum enclosure large", "finished", "Units", 71, 160, 20, 80, 28),
  p("ENC-SS-M", "Stainless enclosure medium", "finished", "Units", 120, 270, 10, 40, 16),
  p("HNG-HD", "Heavy duty hinge", "finished", "Units", 3.6, 8.8, 150, 600, 380),
  p("BRG-6205", "Ball bearing 6205", "finished", "Units", 4.8, 11, 100, 400, 260),
];

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export interface SeedSupplier {
  key: string;
  name: string;
  email: string;
  terms: string;
}

export const SUPPLIERS: SeedSupplier[] = [
  {
    key: "midwest",
    name: "Midwest Steel Supply",
    email: "sales@midwest-steel.example",
    terms: "30 Days",
  },
  {
    key: "apex",
    name: "Apex Metals Distribution",
    email: "orders@apex-metals.example",
    terms: "30 Days",
  },
  { key: "alumacore", name: "AlumaCore Inc.", email: "quotes@alumacore.example", terms: "45 Days" },
  {
    key: "fastenright",
    name: "FastenRight Industrial",
    email: "sales@fastenright.example",
    terms: "15 Days",
  },
  {
    key: "precision",
    name: "Precision Components Co.",
    email: "rfq@precision-comp.example",
    terms: "30 Days",
  },
  {
    key: "globalalloy",
    name: "Global Alloy Traders",
    email: "trade@globalalloy.example",
    terms: "Immediate Payment",
  },
];

export interface SupplierOffer {
  supplier: string;
  /** Multiplier on product cost. */
  priceFactor: number;
  /** MOQ as a fraction of the product's reorder max (rounded). */
  moqFactor: number;
  leadDays: number;
}

/** Which suppliers offer a product, by SKU prefix. First match wins. */
const OFFER_RULES: { prefix: string; offers: SupplierOffer[] }[] = [
  {
    prefix: "STL-",
    offers: [
      { supplier: "midwest", priceFactor: 1.0, moqFactor: 0.1, leadDays: 7 },
      { supplier: "apex", priceFactor: 1.06, moqFactor: 0.05, leadDays: 10 },
      { supplier: "globalalloy", priceFactor: 0.9, moqFactor: 0.6, leadDays: 28 },
    ],
  },
  {
    prefix: "SS-",
    offers: [
      { supplier: "apex", priceFactor: 1.0, moqFactor: 0.1, leadDays: 10 },
      { supplier: "globalalloy", priceFactor: 0.92, moqFactor: 0.5, leadDays: 28 },
    ],
  },
  {
    prefix: "BRZ-",
    offers: [{ supplier: "apex", priceFactor: 1.0, moqFactor: 0.15, leadDays: 10 }],
  },
  {
    prefix: "CU-",
    offers: [{ supplier: "apex", priceFactor: 1.0, moqFactor: 0.15, leadDays: 10 }],
  },
  {
    prefix: "PWD-",
    offers: [{ supplier: "apex", priceFactor: 1.0, moqFactor: 0.25, leadDays: 10 }],
  },
  {
    prefix: "AL-",
    offers: [
      { supplier: "alumacore", priceFactor: 1.0, moqFactor: 0.15, leadDays: 14 },
      { supplier: "apex", priceFactor: 1.08, moqFactor: 0.05, leadDays: 10 },
    ],
  },
  {
    prefix: "FAS-",
    offers: [
      { supplier: "fastenright", priceFactor: 1.0, moqFactor: 0.1, leadDays: 5 },
      { supplier: "globalalloy", priceFactor: 0.85, moqFactor: 0.75, leadDays: 28 },
    ],
  },
  {
    prefix: "ENC-ALU",
    offers: [
      { supplier: "precision", priceFactor: 1.0, moqFactor: 0.15, leadDays: 21 },
      { supplier: "alumacore", priceFactor: 1.04, moqFactor: 0.1, leadDays: 14 },
    ],
  },
  {
    prefix: "HNG-",
    offers: [
      { supplier: "fastenright", priceFactor: 1.02, moqFactor: 0.1, leadDays: 5 },
      { supplier: "precision", priceFactor: 1.0, moqFactor: 0.2, leadDays: 21 },
    ],
  },
  {
    prefix: "",
    offers: [{ supplier: "precision", priceFactor: 1.0, moqFactor: 0.15, leadDays: 21 }],
  },
];

export function offersFor(product: SeedProduct): SupplierOffer[] {
  return OFFER_RULES.find((r) => product.sku.startsWith(r.prefix))!.offers;
}

export function moqFor(product: SeedProduct, offer: SupplierOffer): number {
  const raw = product.max * offer.moqFactor;
  const step = product.max >= 5000 ? 500 : product.max >= 500 ? 50 : 5;
  return Math.max(step, Math.round(raw / step) * step);
}

export function offerPrice(product: SeedProduct, offer: SupplierOffer): number {
  return Math.round(product.cost * offer.priceFactor * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Customers and pricing tiers
// ---------------------------------------------------------------------------

export type Tier = "Standard" | "Silver" | "Gold" | "Platinum";

/** Percentage discount off list price per tier; volume breaks add VOLUME_EXTRA_PCT. */
export const TIER_DISCOUNT: Record<Tier, number> = {
  Standard: 0,
  Silver: 5,
  Gold: 10,
  Platinum: 15,
};
export const VOLUME_BREAK_QTY = 1000;
export const VOLUME_EXTRA_PCT = 3;

export interface SeedCustomer {
  name: string;
  email: string;
  tier: Tier;
  terms: string;
}

export const CUSTOMERS: SeedCustomer[] = [
  {
    name: "Northwind Machinery Ltd",
    email: "purchasing@northwind-machinery.example",
    tier: "Gold",
    terms: "30 Days",
  },
  {
    name: "Cascade Automation",
    email: "buyer@cascade-automation.example",
    tier: "Silver",
    terms: "15 Days",
  },
  {
    name: "Redwood Industrial Equipment",
    email: "orders@redwood-ie.example",
    tier: "Standard",
    terms: "Immediate Payment",
  },
  {
    name: "Summit Packaging Systems",
    email: "procurement@summit-packaging.example",
    tier: "Silver",
    terms: "30 Days",
  },
  {
    name: "Ironbridge Fabrication",
    email: "supply@ironbridge-fab.example",
    tier: "Platinum",
    terms: "45 Days",
  },
  {
    name: "BlueHarbor Marine Works",
    email: "parts@blueharbor-marine.example",
    tier: "Gold",
    terms: "30 Days",
  },
  {
    name: "Prairie Agri-Tech",
    email: "ops@prairie-agritech.example",
    tier: "Standard",
    terms: "15 Days",
  },
  {
    name: "Keystone Elevator Co.",
    email: "materials@keystone-elevator.example",
    tier: "Platinum",
    terms: "45 Days",
  },
  {
    name: "Lakeshore HVAC Supply",
    email: "orders@lakeshore-hvac.example",
    tier: "Silver",
    terms: "30 Days",
  },
  {
    name: "Summit Hydraulics",
    email: "purchasing@summit-hydraulics.example",
    tier: "Standard",
    terms: "30 Days",
  },
  {
    name: "Orion Robotics Inc.",
    email: "sourcing@orion-robotics.example",
    tier: "Gold",
    terms: "21 Days",
  },
  {
    name: "Meridian Food Machinery",
    email: "buyer@meridian-fm.example",
    tier: "Silver",
    terms: "End of Following Month",
  },
];

// ---------------------------------------------------------------------------
// Deliberate scenarios (used by agents' acceptance checks and the eval cases)
// ---------------------------------------------------------------------------

/** Open (confirmed, undelivered) customer demand that creates shortages. */
export interface OpenSale {
  ref: string;
  customer: string;
  daysUntilDelivery: number;
  lines: { sku: string; qty: number }[];
}

export const OPEN_SALES: OpenSale[] = [
  {
    ref: "SEED-SO-OPEN-1",
    customer: "Ironbridge Fabrication",
    daysUntilDelivery: 10,
    lines: [
      { sku: "PLT-BASE-300", qty: 40 },
      { sku: "FLG-DN100", qty: 20 },
    ],
  },
  {
    ref: "SEED-SO-OPEN-2",
    customer: "Keystone Elevator Co.",
    daysUntilDelivery: 14,
    lines: [
      { sku: "AL-SHT-4.0", qty: 25 },
      { sku: "ENC-ALU-L", qty: 12 },
    ],
  },
  {
    ref: "SEED-SO-OPEN-3",
    customer: "Northwind Machinery Ltd",
    daysUntilDelivery: 7,
    lines: [
      { sku: "FAS-ANC-M10", qty: 400 },
      { sku: "BRK-L-100", qty: 60 },
    ],
  },
  {
    ref: "SEED-SO-OPEN-4",
    customer: "BlueHarbor Marine Works",
    daysUntilDelivery: 21,
    lines: [
      { sku: "SHF-40-500", qty: 15 },
      { sku: "GER-SPR-40T", qty: 20 },
    ],
  },
  {
    ref: "SEED-SO-OPEN-5",
    customer: "Orion Robotics Inc.",
    daysUntilDelivery: 12,
    lines: [
      { sku: "ENC-SS-M", qty: 6 },
      { sku: "BRG-6205", qty: 80 },
    ],
  },
  {
    ref: "SEED-SO-OPEN-6",
    customer: "Cascade Automation",
    daysUntilDelivery: 18,
    lines: [
      { sku: "BRK-U-80", qty: 50 },
      { sku: "HNG-HD", qty: 120 },
    ],
  },
  {
    ref: "SEED-SO-OPEN-7",
    customer: "Lakeshore HVAC Supply",
    daysUntilDelivery: 9,
    lines: [{ sku: "FLG-DN50", qty: 30 }],
  },
  {
    ref: "SEED-SO-OPEN-8",
    customer: "Meridian Food Machinery",
    daysUntilDelivery: 25,
    lines: [
      { sku: "STL-SHT-2.0", qty: 10 },
      { sku: "SS-SHT-1.5", qty: 6 },
    ],
  },
];

/** Open (confirmed, not received) purchase orders: some cover existing shortages. */
export interface OpenPurchase {
  ref: string;
  supplier: string;
  daysUntilArrival: number;
  lines: { sku: string; qty: number }[];
}

export const OPEN_PURCHASES: OpenPurchase[] = [
  // Covers STL-TUBE-50, which is below its reorder point on hand.
  {
    ref: "SEED-PO-OPEN-1",
    supplier: "midwest",
    daysUntilArrival: 5,
    lines: [{ sku: "STL-TUBE-50", qty: 300 }],
  },
  // Covers FAS-NUT-M8.
  {
    ref: "SEED-PO-OPEN-2",
    supplier: "fastenright",
    daysUntilArrival: 3,
    lines: [
      { sku: "FAS-NUT-M8", qty: 10000 },
      { sku: "FAS-WSH-M10", qty: 5000 },
    ],
  },
  {
    ref: "SEED-PO-OPEN-3",
    supplier: "alumacore",
    daysUntilArrival: 9,
    lines: [{ sku: "AL-EXT-40", qty: 100 }],
  },
  {
    ref: "SEED-PO-OPEN-4",
    supplier: "precision",
    daysUntilArrival: 15,
    lines: [{ sku: "GER-SPR-20T", qty: 50 }],
  },
];

/** A draft RFQ left unconfirmed. Must not count as incoming supply. */
export const DRAFT_PURCHASE: OpenPurchase = {
  ref: "SEED-PO-DRAFT-1",
  supplier: "apex",
  daysUntilArrival: 10,
  lines: [{ sku: "SS-SHT-3.0", qty: 20 }],
};

/** SKUs the baseline deliberately leaves short, with the reason. */
export const SHORTAGE_SCENARIOS: Record<string, string> = {
  "STL-SHT-2.0": "below reorder point; suppliers trade price/MOQ against lead time",
  "STL-SHT-5.0": "below reorder point, no incoming supply",
  "STL-BAR-RND-30": "below reorder point, no incoming supply",
  "SS-SHT-3.0": "below reorder point; only a draft RFQ exists (not real supply)",
  "FAS-BLT-M8X25": "below reorder point, no incoming supply",
  "BRK-L-150": "below reorder point, no incoming supply",
  "PLT-BASE-300": "forecast negative against open sales order",
  "AL-SHT-4.0": "forecast negative against open sales order; MOQ edge",
  "FAS-ANC-M10": "forecast negative against open sales order",
  "STL-TUBE-50": "below reorder point but covered by an open purchase order",
  "FAS-NUT-M8": "below reorder point but covered by an open purchase order",
};
