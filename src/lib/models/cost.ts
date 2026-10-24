import { z } from "zod";

/** USD per one million tokens. */
const priceSchema = z.object({ input: z.number().nonnegative(), output: z.number().nonnegative() });
const priceTableSchema = z.record(z.string(), priceSchema);

export type PriceTable = z.infer<typeof priceTableSchema>;

/**
 * Prices are configuration, not code: provider prices change and are not
 * verifiable offline. Set MODEL_PRICES to JSON such as
 *   {"anthropic:<model-id>": {"input": 3, "output": 15}}
 * Models without an entry report a cost of null rather than a guess.
 */
export function loadPriceTable(raw: string | undefined = process.env.MODEL_PRICES): PriceTable {
  if (!raw) return {};
  return priceTableSchema.parse(JSON.parse(raw));
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export function estimateCost(
  modelSpec: string,
  usage: TokenUsage,
  prices: PriceTable = loadPriceTable(),
): number | null {
  const price = prices[modelSpec];
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}
