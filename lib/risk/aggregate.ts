import type { RiskCategory, Severity } from "@/lib/ai/schemas";
import { severityRank } from "@/lib/risk/colors";

export type AssessmentLike = {
  riskScore: number;
  severity: Severity;
  confidence: number;
  categories: RiskCategory[];
};

/** Confidence-weighted overall risk (0-100). */
export function aggregateOverall(assessments: AssessmentLike[]): number {
  if (assessments.length === 0) return 0;
  const weight = (a: AssessmentLike) => 0.5 + a.confidence / 2;
  const num = assessments.reduce((s, a) => s + a.riskScore * weight(a), 0);
  const den = assessments.reduce((s, a) => s + weight(a), 0);
  return Math.round(num / den);
}

export function severityCounts(assessments: AssessmentLike[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { safe: 0, medium: 0, high: 0, critical: 0 };
  for (const a of assessments) counts[a.severity]++;
  return counts;
}

export function categoryBreakdown(assessments: AssessmentLike[]): { category: RiskCategory; count: number; avg: number }[] {
  const map = new Map<RiskCategory, { count: number; total: number }>();
  for (const a of assessments) {
    for (const c of a.categories) {
      const cur = map.get(c) ?? { count: 0, total: 0 };
      cur.count++;
      cur.total += a.riskScore;
      map.set(c, cur);
    }
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, count: v.count, avg: Math.round(v.total / v.count) }))
    .sort((a, b) => b.avg - a.avg);
}

export function topRisks<T extends AssessmentLike>(assessments: T[], n = 10): T[] {
  return [...assessments]
    .sort((a, b) => b.riskScore - a.riskScore || severityRank(b.severity) - severityRank(a.severity))
    .slice(0, n);
}
