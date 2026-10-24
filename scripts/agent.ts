/**
 * Run an agent from the terminal and print its tool calls and proposal.
 *
 *   pnpm agent:quote "Ironbridge needs 40 base plates 300x300"
 *   pnpm agent:procure "check shortages"
 *   pnpm agent:quote --model anthropic:<model-id> "..."
 */
import { runProcurementAgent } from "../src/lib/agents/procurement/agent";
import { runQuotingAgent } from "../src/lib/agents/quoting/agent";
import type { AgentEvent } from "../src/lib/agents/runner";
import { parseEnv } from "../src/lib/env";
import { defaultModelSpec, resolveModel } from "../src/lib/models/registry";
import { OdooClient } from "../src/lib/odoo/client";
import { OdooRepository } from "../src/lib/odoo/repository";

const args = process.argv.slice(2);
const mode = args.shift();
let modelSpec: string | undefined;
const modelFlag = args.indexOf("--model");
if (modelFlag >= 0) modelSpec = args.splice(modelFlag, 2)[1];
const request = args.join(" ").trim();

if ((mode !== "quote" && mode !== "procure") || !request) {
  console.error('Usage: tsx scripts/agent.ts <quote|procure> [--model provider:id] "<request>"');
  process.exit(2);
}

const short = (v: unknown) => {
  const s = JSON.stringify(v);
  return s.length > 140 ? `${s.slice(0, 137)}...` : s;
};

function onEvent(e: AgentEvent) {
  if (e.type === "tool") {
    console.log(
      `  tool  ${e.name} ${short(e.input)} -> ${e.error ? `ERROR ${e.error}` : short(e.output)} (${Math.round(e.latencyMs)}ms)`,
    );
  } else if (e.type === "submit") {
    console.log(`  submit ${e.accepted ? "accepted" : `rejected ${short(e.issues)}`}`);
  } else {
    console.log(`  step ${e.step} tokens in=${e.inputTokens} out=${e.outputTokens}`);
  }
}

async function main() {
  const env = parseEnv(process.env);
  const repo = new OdooRepository(
    new OdooClient({
      url: env.ODOO_URL,
      db: env.ODOO_DB,
      username: env.ODOO_USERNAME,
      password: env.ODOO_PASSWORD,
    }),
  );
  const spec = modelSpec ?? defaultModelSpec();
  const model = resolveModel(spec);
  console.log(`model: ${spec}\nrequest: ${request}\n`);

  const started = Date.now();
  const run = mode === "quote" ? runQuotingAgent : runProcurementAgent;
  const result = await run({ request, repo, model, onEvent });
  console.log(`\nresult (${((Date.now() - started) / 1000).toFixed(1)}s):`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
