import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/crypto";

export type AiProvider = "openai" | "openai-compatible" | "azure" | "anthropic" | "google";

export type ResolvedAi = {
  mode: "mock" | "live";
  provider: AiProvider;
  apiKey?: string;
  baseUrl?: string;
  azureResource?: string;
  /** model id for deep tasks (risk, negotiation, assistant). */
  deep: string;
  /** model id for fast tasks (segmentation). */
  fast: string;
  label: string;
  /** Signed-in user this request belongs to — used to attribute AI cost. */
  userId?: string;
};

/** Sensible default model ids per provider (override via env or a per-user key). */
export function defaultModels(provider: AiProvider): { deep: string; fast: string } {
  switch (provider) {
    case "anthropic":
      return { deep: "claude-3-5-sonnet-latest", fast: "claude-3-5-haiku-latest" };
    case "google":
      return { deep: "gemini-1.5-pro", fast: "gemini-1.5-flash" };
    case "azure":
    case "openai":
    case "openai-compatible":
    default:
      return { deep: "gpt-4o", fast: "gpt-4o-mini" };
  }
}

/** Human-friendly provider name (used for logging labels). */
export function providerLabel(provider: AiProvider): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "openai-compatible":
      return "OpenAI-compatible";
    case "azure":
      return "Azure OpenAI";
    case "anthropic":
      return "Anthropic Claude";
    case "google":
      return "Google Gemini";
  }
}

const MOCK: ResolvedAi = { mode: "mock", provider: "openai", deep: "mock", fast: "mock", label: "حالت آزمایشی (mock)" };

/** First non-empty value among the given env var names. */
function envFirst(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

/** Truthy AI_MODE values that switch the app from mock to a live provider. */
const LIVE_MODES = new Set(["live", "openai", "on", "true", "1", "yes"]);

/** Normalize AI_PROVIDER (with common aliases) to a canonical provider id. */
function normalizeProvider(raw: string | undefined): AiProvider {
  switch ((raw ?? "").toLowerCase().trim()) {
    case "azure":
      return "azure";
    case "google":
    case "gemini":
      return "google";
    case "anthropic":
    case "claude":
      return "anthropic";
    case "openai-compatible":
    case "compatible":
    case "custom":
    case "proxy":
    case "gateway":
    case "openrouter":
      return "openai-compatible";
    case "openai":
    case "":
    default:
      return "openai";
  }
}

/**
 * Deployment-level engine from environment variables. Returns null when the app
 * is not configured to run live (AI_MODE is mock/unset), so the caller falls
 * back to the deterministic mock engine.
 */
function resolveEnvAi(userId: string | undefined): ResolvedAi | null {
  if (!LIVE_MODES.has((process.env.AI_MODE ?? "").toLowerCase().trim())) return null;

  let provider = normalizeProvider(process.env.AI_PROVIDER);
  const def = defaultModels(provider);

  switch (provider) {
    case "azure":
      return {
        mode: "live",
        provider,
        apiKey: envFirst("AZURE_API_KEY", "OPENAI_API_KEY"),
        azureResource: envFirst("AZURE_RESOURCE_NAME"),
        baseUrl: envFirst("AZURE_BASE_URL"),
        // For Azure, the "model" is your *deployment* name.
        deep: envFirst("OPENAI_MODEL", "AZURE_DEPLOYMENT") || def.deep,
        fast: envFirst("OPENAI_MODEL_FAST", "AZURE_DEPLOYMENT_FAST") || def.fast,
        label: providerLabel(provider),
        userId,
      };

    case "google":
      return {
        mode: "live",
        provider,
        apiKey: envFirst("GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"),
        baseUrl: envFirst("GOOGLE_BASE_URL"),
        deep: envFirst("GOOGLE_MODEL", "GEMINI_MODEL") || def.deep,
        fast: envFirst("GOOGLE_MODEL_FAST", "GEMINI_MODEL_FAST") || def.fast,
        label: providerLabel(provider),
        userId,
      };

    case "anthropic":
      return {
        mode: "live",
        provider,
        apiKey: envFirst("ANTHROPIC_API_KEY"),
        baseUrl: envFirst("ANTHROPIC_BASE_URL"),
        deep: envFirst("ANTHROPIC_MODEL") || def.deep,
        fast: envFirst("ANTHROPIC_MODEL_FAST") || def.fast,
        label: providerLabel(provider),
        userId,
      };

    // OpenAI and any OpenAI-compatible endpoint share the same client. A base
    // URL with the plain "openai" provider is treated as compatible for labels.
    case "openai-compatible":
    case "openai":
    default: {
      const baseUrl = envFirst("OPENAI_BASE_URL");
      if (baseUrl) provider = "openai-compatible";
      return {
        mode: "live",
        provider,
        apiKey: envFirst("OPENAI_API_KEY"),
        baseUrl,
        deep: envFirst("OPENAI_MODEL") || def.deep,
        fast: envFirst("OPENAI_MODEL_FAST") || def.fast,
        label: providerLabel(provider),
        userId,
      };
    }
  }
}

/**
 * Resolve the AI engine for the current request, preferring (in order):
 *   1) the signed-in user's active per-user credential (their own key),
 *   2) deployment-level environment variables (AI_MODE + AI_PROVIDER),
 *   3) the deterministic mock engine (no key, offline).
 */
export async function resolveAi(): Promise<ResolvedAi> {
  // Resolve the caller once so every branch can attribute AI cost to them.
  let userId: string | undefined;

  // 1) Per-user credential (their own purchased key).
  try {
    const user = await getCurrentUser();
    if (user) {
      userId = user.id;
      const cred = await prisma.apiCredential.findFirst({
        where: { userId: user.id, isActive: true },
        orderBy: { createdAt: "desc" },
      });
      if (cred) {
        const provider = cred.provider as AiProvider;
        const def = defaultModels(provider);
        const apiKey = decryptSecret(cred.apiKeyEnc);
        if (apiKey) {
          return {
            mode: "live",
            provider,
            apiKey,
            baseUrl: cred.baseUrl ?? undefined,
            azureResource: cred.azureResource ?? undefined,
            deep: cred.model || def.deep,
            fast: cred.modelFast || cred.model || def.fast,
            label: `${cred.label} · ${providerLabel(provider)}`,
            userId,
          };
        }
      }
    }
  } catch {
    // fall through to env/mock
  }

  // 2) Env fallback (deployment-level key), then 3) mock.
  return resolveEnvAi(userId) ?? { ...MOCK, userId };
}
