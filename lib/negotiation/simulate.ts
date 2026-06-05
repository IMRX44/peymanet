/**
 * What-if risk-reduction simulator.
 * Recomputes the projected overall risk if a chosen subset of negotiation
 * suggestions were accepted — instant, deterministic, no AI call.
 */

export type SimItem = {
  id: string;
  clauseId: string | null;
  currentRisk: number;
  projectedRisk: number;
};

export type ClauseRisk = {
  clauseId: string;
  riskScore: number;
  confidence: number;
};

export type SimulationResult = {
  currentOverall: number;
  projectedOverall: number;
  delta: number;
  acceptedCount: number;
};

function weightedAvg(values: { risk: number; confidence: number }[]): number {
  if (values.length === 0) return 0;
  const w = (c: number) => 0.5 + c / 2;
  const num = values.reduce((s, v) => s + v.risk * w(v.confidence), 0);
  const den = values.reduce((s, v) => s + w(v.confidence), 0);
  return Math.round(num / den);
}

export function simulateRiskReduction(
  clauseRisks: ClauseRisk[],
  items: SimItem[],
  acceptedIds: Set<string>,
): SimulationResult {
  const projectedByClause = new Map<string, number>();
  let acceptedCount = 0;
  for (const it of items) {
    if (acceptedIds.has(it.id) && it.clauseId) {
      projectedByClause.set(it.clauseId, it.projectedRisk);
      acceptedCount++;
    }
  }

  const current = weightedAvg(clauseRisks.map((c) => ({ risk: c.riskScore, confidence: c.confidence })));
  const projected = weightedAvg(
    clauseRisks.map((c) => ({
      risk: projectedByClause.get(c.clauseId) ?? c.riskScore,
      confidence: c.confidence,
    })),
  );

  return {
    currentOverall: current,
    projectedOverall: projected,
    delta: current - projected,
    acceptedCount,
  };
}
