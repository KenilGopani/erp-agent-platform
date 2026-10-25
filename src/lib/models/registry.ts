import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export const PROVIDERS = ["openai", "anthropic", "google", "nvidia"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** A model reference such as `anthropic:claude-sonnet-5-5`. IDs always come from config. */
export interface ModelSpec {
  provider: Provider;
  modelId: string;
}

const KEY_ENV: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  nvidia: "NVIDIA_API_KEY",
};

/** NVIDIA NIM serves an OpenAI-compatible chat completions API. */
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export function parseModelSpec(spec: string): ModelSpec {
  const idx = spec.indexOf(":");
  const provider = spec.slice(0, idx);
  const modelId = spec.slice(idx + 1);
  if (idx <= 0 || !modelId || !(PROVIDERS as readonly string[]).includes(provider)) {
    throw new Error(
      `Invalid model "${spec}". Use "<provider>:<model-id>" with provider one of ${PROVIDERS.join(", ")}.`,
    );
  }
  return { provider: provider as Provider, modelId };
}

export function formatModelSpec(spec: ModelSpec): string {
  return `${spec.provider}:${spec.modelId}`;
}

/** Builds the AI SDK model for a spec; fails early and clearly if the API key is missing. */
export function resolveModel(
  spec: string | ModelSpec,
  env: Record<string, string | undefined> = process.env,
): LanguageModel {
  const s = typeof spec === "string" ? parseModelSpec(spec) : spec;
  if (!env[KEY_ENV[s.provider]]) {
    throw new Error(`Missing ${KEY_ENV[s.provider]} for model ${formatModelSpec(s)}.`);
  }
  switch (s.provider) {
    case "openai":
      return openai(s.modelId);
    case "anthropic":
      return anthropic(s.modelId);
    case "google":
      return google(s.modelId);
    case "nvidia":
      return createOpenAICompatible({
        name: "nvidia",
        baseURL: env.NVIDIA_BASE_URL || NVIDIA_BASE_URL,
        apiKey: env.NVIDIA_API_KEY,
      }).chatModel(s.modelId);
  }
}

/** Default model for agent runs, from AGENT_MODEL. */
export function defaultModelSpec(env: Record<string, string | undefined> = process.env): string {
  const spec = env.AGENT_MODEL;
  if (!spec) {
    throw new Error('AGENT_MODEL is not set. Example: AGENT_MODEL="anthropic:<model-id>".');
  }
  return spec;
}
