export type AiMode = "mock" | "live";

/** Whether the deployment is configured to call a live provider (vs. mock). */
export function aiMode(): AiMode {
  const m = (process.env.AI_MODE ?? "").toLowerCase().trim();
  return ["live", "openai", "on", "true", "1", "yes"].includes(m) ? "live" : "mock";
}

export const MODELS = {
  /** Deep analysis: risk + negotiation. */
  deep: process.env.OPENAI_MODEL || "gpt-4o",
  /** Cheap/fast: segmentation + lightweight passes. */
  fast: process.env.OPENAI_MODEL_FAST || "gpt-4o-mini",
};

/**
 * Rough price table (USD per 1K tokens) for cost estimation. These are
 * approximate list prices — override/extend for your own account. Unknown
 * models fall back to $0 (usage is still counted).
 */
const PRICE: Record<string, { in: number; out: number }> = {
  // OpenAI
  "gpt-4o": { in: 0.0025, out: 0.01 },
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  // Anthropic
  "claude-3-5-sonnet-latest": { in: 0.003, out: 0.015 },
  "claude-3-5-haiku-latest": { in: 0.0008, out: 0.004 },
  // Google Gemini
  "gemini-2.5-pro": { in: 0.00125, out: 0.01 },
  "gemini-2.5-flash": { in: 0.0003, out: 0.0025 },
  "gemini-2.0-flash": { in: 0.0001, out: 0.0004 },
  "gemini-1.5-pro": { in: 0.00125, out: 0.005 },
  "gemini-1.5-flash": { in: 0.000075, out: 0.0003 },
};

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const p = PRICE[model] ?? { in: 0, out: 0 };
  return (promptTokens / 1000) * p.in + (completionTokens / 1000) * p.out;
}
