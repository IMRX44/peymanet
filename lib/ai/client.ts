import type { LanguageModelV1 } from "ai";

/**
 * Live model resolver. Lets you point the app at:
 *   • OpenAI (default)                       → OPENAI_API_KEY
 *   • any OpenAI-compatible endpoint         → OPENAI_API_KEY + OPENAI_BASE_URL
 *     (resellers / proxies / gateways / OpenRouter / local LLM servers, …)
 *   • Azure OpenAI                           → AI_PROVIDER=azure + AZURE_* vars
 *
 * Only loaded when AI_MODE=openai (mock mode never touches the network).
 */
export type LiveProvider = "openai" | "azure";

export function liveProvider(): LiveProvider {
  return (process.env.AI_PROVIDER ?? "").toLowerCase() === "azure" ? "azure" : "openai";
}

/** Human-readable label for logs / health checks. */
export function liveProviderLabel(): string {
  if (liveProvider() === "azure") return `azure(${process.env.AZURE_RESOURCE_NAME ?? "?"})`;
  return process.env.OPENAI_BASE_URL ? `openai-compatible(${process.env.OPENAI_BASE_URL})` : "openai";
}

/**
 * Returns the language model for the given id.
 * For Azure, `modelId` is the *deployment* name (set OPENAI_MODEL / OPENAI_MODEL_FAST
 * to your deployment names).
 */
export async function getLanguageModel(modelId: string): Promise<LanguageModelV1> {
  if (liveProvider() === "azure") {
    const { createAzure } = await import("@ai-sdk/azure");
    const azure = createAzure({
      resourceName: process.env.AZURE_RESOURCE_NAME,
      apiKey: process.env.AZURE_API_KEY ?? process.env.OPENAI_API_KEY,
      // Optional overrides — only set if provided.
      ...(process.env.AZURE_API_VERSION ? { apiVersion: process.env.AZURE_API_VERSION } : {}),
      ...(process.env.AZURE_BASE_URL ? { baseURL: process.env.AZURE_BASE_URL } : {}),
    });
    return azure(modelId);
  }

  const { createOpenAI } = await import("@ai-sdk/openai");
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // Custom base URL for OpenAI-compatible providers; falls back to OpenAI's default.
    ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
    // Optional extra headers (e.g. some gateways require them), as JSON in OPENAI_HEADERS.
    ...(process.env.OPENAI_HEADERS ? { headers: safeJson(process.env.OPENAI_HEADERS) } : {}),
  });
  return openai(modelId);
}

function safeJson(raw: string): Record<string, string> {
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}
