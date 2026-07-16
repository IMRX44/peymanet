import type { LanguageModelV1 } from "ai";
import type { ResolvedAi } from "@/lib/ai/resolve";

/**
 * Live model resolver. Builds the right Vercel AI SDK provider from a resolved
 * credential (per-user key or env fallback). Supports:
 *   • OpenAI + any OpenAI-compatible endpoint (reseller / proxy / gateway / local)
 *   • Azure OpenAI
 *   • Anthropic (Claude)
 *   • Google (Gemini)
 *
 * Only loaded when mode = "live" (mock mode never touches the network).
 */
export async function getLanguageModel(ai: ResolvedAi, modelId: string): Promise<LanguageModelV1> {
  switch (ai.provider) {
    case "azure": {
      const { createAzure } = await import("@ai-sdk/azure");
      const azure = createAzure({
        resourceName: ai.azureResource,
        apiKey: ai.apiKey,
        ...(process.env.AZURE_API_VERSION ? { apiVersion: process.env.AZURE_API_VERSION } : {}),
        ...(ai.baseUrl ? { baseURL: ai.baseUrl } : {}),
      });
      return azure(modelId);
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      const anthropic = createAnthropic({
        apiKey: ai.apiKey,
        ...(ai.baseUrl ? { baseURL: ai.baseUrl } : {}),
      });
      return anthropic(modelId);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      const google = createGoogleGenerativeAI({
        apiKey: ai.apiKey,
        ...(ai.baseUrl ? { baseURL: ai.baseUrl } : {}),
      });
      return google(modelId);
    }
    case "openai":
    case "openai-compatible":
    default: {
      const { createOpenAI } = await import("@ai-sdk/openai");
      // Any third-party OpenAI-compatible endpoint (reseller / proxy / gateway /
      // OpenRouter / local server) → "compatible" mode so we don't send
      // OpenAI-only params the endpoint may reject.
      const compatible = ai.provider === "openai-compatible" || !!ai.baseUrl;
      const openai = createOpenAI({
        apiKey: ai.apiKey,
        ...(ai.baseUrl ? { baseURL: ai.baseUrl } : {}),
        ...(process.env.OPENAI_HEADERS ? { headers: safeJson(process.env.OPENAI_HEADERS) } : {}),
        compatibility: compatible ? "compatible" : "strict",
      });
      // Don't force structured outputs (json_schema) on compatible endpoints;
      // most open models / gateways don't implement it. providers.ts uses
      // JSON mode + a repair pass for these instead.
      return compatible ? openai(modelId, { structuredOutputs: false }) : openai(modelId);
    }
  }
}

function safeJson(raw: string): Record<string, string> {
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}
