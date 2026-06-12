import type { Severity } from "@/lib/ai/schemas";

/**
 * Risk score → severity bands → colors.
 *   0-25 safe · 26-50 medium · 51-75 high · 76-100 critical
 */
export function scoreToSeverity(score: number): Severity {
  if (score <= 25) return "safe";
  if (score <= 50) return "medium";
  if (score <= 75) return "high";
  return "critical";
}

export const SEVERITY_HEX: Record<Severity, string> = {
  safe: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

/** HSL components (used by CSS variables and animated fills). */
export const SEVERITY_HSL: Record<Severity, string> = {
  safe: "142 71% 45%",
  medium: "48 96% 53%",
  high: "25 95% 53%",
  critical: "0 84% 60%",
};

/** Tailwind-ready background tint class per severity (used on clause highlights). */
export const SEVERITY_BG_CLASS: Record<Severity, string> = {
  safe: "bg-risk-safe/15 hover:bg-risk-safe/25",
  medium: "bg-risk-medium/15 hover:bg-risk-medium/25",
  high: "bg-risk-high/20 hover:bg-risk-high/30",
  critical: "bg-risk-critical/25 hover:bg-risk-critical/35",
};

export const SEVERITY_TEXT_CLASS: Record<Severity, string> = {
  safe: "text-risk-safe",
  medium: "text-risk-medium",
  high: "text-risk-high",
  critical: "text-risk-critical",
};

export const SEVERITY_BORDER_CLASS: Record<Severity, string> = {
  safe: "border-risk-safe/40",
  medium: "border-risk-medium/40",
  high: "border-risk-high/50",
  critical: "border-risk-critical/60",
};

export function severityRank(s: Severity): number {
  return { safe: 0, medium: 1, high: 2, critical: 3 }[s];
}
