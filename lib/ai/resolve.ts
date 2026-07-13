import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/crypto";

export type AiProvider = "openai" | "anthropic" | "azure" | "google" | "openai-compatible";

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

/** Sensible default model ids per provider. */
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

const MOCK: ResolvedAi = { mode: "mock", provider: "openai", deep: "mock", fast: "mock", label: "حالت آزمایشی (mock)" };

/**
 * Resolve the AI engine for the current request, preferring the signed-in
 * user's active credential, then env vars, then deterministic mock.
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
            label: `${cred.label} · ${provider}`,
            userId,
          };
        }
      }
    }
  } catch {
    // fall through to env/mock
  }

  // 2) Env fallback (deployment-level key).
  if ((process.env.AI_MODE ?? "").toLowerCase() === "openai") {
    const provider: AiProvider =
      (process.env.AI_PROVIDER ?? "").toLowerCase() === "azure" ? "azure" : "openai";
    const def = defaultModels(provider);
    return {
      mode: "live",
      provider,
      apiKey: process.env.OPENAI_API_KEY ?? process.env.AZURE_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL ?? undefined,
      azureResource: process.env.AZURE_RESOURCE_NAME ?? undefined,
      deep: process.env.OPENAI_MODEL || def.deep,
      fast: process.env.OPENAI_MODEL_FAST || def.fast,
      label: process.env.OPENAI_BASE_URL ? `openai-compatible` : provider,
      userId,
    };
  }

  // 3) Mock.
  return { ...MOCK, userId };
}
