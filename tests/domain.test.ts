import { describe, it, expect } from "vitest";
import { threeWayMerge } from "@/lib/events/merge";
import { wordDiff } from "@/lib/diff/textDiff";
import { aggregateOverall, topRisks, severityCounts } from "@/lib/risk/aggregate";
import { simulateRiskReduction } from "@/lib/negotiation/simulate";
import { scoreToSeverity } from "@/lib/risk/colors";
import { mockRiskAssessment, mockSegmentation, mockNegotiationReport } from "@/lib/ai/mock";
import { RiskAssessmentResult, NegotiationReportResult } from "@/lib/ai/schemas";

describe("threeWayMerge", () => {
  it("fast-forwards when one side is unchanged", () => {
    const base = "a\n\nb\n\nc";
    const theirs = "a\n\nB CHANGED\n\nc";
    const r = threeWayMerge(base, base, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toContain("B CHANGED");
  });

  it("merges non-overlapping changes cleanly", () => {
    const base = "p1\n\np2\n\np3";
    const ours = "P1 NEW\n\np2\n\np3";
    const theirs = "p1\n\np2\n\nP3 NEW";
    const r = threeWayMerge(base, ours, theirs);
    expect(r.clean).toBe(true);
    expect(r.merged).toContain("P1 NEW");
    expect(r.merged).toContain("P3 NEW");
  });

  it("detects a conflict on the same paragraph", () => {
    const base = "p1\n\np2";
    const ours = "p1\n\nOURS";
    const theirs = "p1\n\nTHEIRS";
    const r = threeWayMerge(base, ours, theirs);
    expect(r.clean).toBe(false);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].ours).toBe("OURS");
    expect(r.conflicts[0].theirs).toBe("THEIRS");
  });
});

describe("wordDiff", () => {
  it("counts added and removed words", () => {
    const d = wordDiff("the quick brown fox", "the slow brown fox jumps");
    expect(d.added).toBeGreaterThan(0);
    expect(d.removed).toBeGreaterThan(0);
    expect(d.segments.some((s) => s.type === "added")).toBe(true);
  });
});

describe("risk scoring + aggregation", () => {
  it("maps scores to severity bands", () => {
    expect(scoreToSeverity(10)).toBe("safe");
    expect(scoreToSeverity(40)).toBe("medium");
    expect(scoreToSeverity(70)).toBe("high");
    expect(scoreToSeverity(90)).toBe("critical");
  });

  it("computes a confidence-weighted overall and sorts top risks", () => {
    const a = [
      { riskScore: 80, severity: "critical" as const, confidence: 0.9, categories: ["liability" as const] },
      { riskScore: 20, severity: "safe" as const, confidence: 0.8, categories: ["legal" as const] },
    ];
    const overall = aggregateOverall(a);
    expect(overall).toBeGreaterThan(20);
    expect(overall).toBeLessThan(80);
    expect(topRisks(a, 1)[0].riskScore).toBe(80);
    expect(severityCounts(a).critical).toBe(1);
  });
});

describe("simulateRiskReduction", () => {
  it("drops projected overall when suggestions are accepted", () => {
    const clauseRisks = [
      { clauseId: "c1", riskScore: 80, confidence: 0.9 },
      { clauseId: "c2", riskScore: 40, confidence: 0.8 },
    ];
    const items = [{ id: "i1", clauseId: "c1", currentRisk: 80, projectedRisk: 30 }];
    const none = simulateRiskReduction(clauseRisks, items, new Set());
    const accepted = simulateRiskReduction(clauseRisks, items, new Set(["i1"]));
    expect(accepted.projectedOverall).toBeLessThan(none.projectedOverall);
    expect(accepted.delta).toBeGreaterThan(0);
    expect(accepted.acceptedCount).toBe(1);
  });
});

describe("mock AI engine produces schema-valid output", () => {
  it("risk assessment validates against the Zod schema", () => {
    const a = mockRiskAssessment("کارفرما می‌تواند قرارداد را فسخ نماید با اطلاع هفت روزه", "فسخ");
    expect(() => RiskAssessmentResult.parse(a)).not.toThrow();
    expect(a.severity).toBe(scoreToSeverity(a.riskScore));
  });

  it("is deterministic for the same input", () => {
    const t = "مسئولیت جبران خسارت بدون سقف";
    expect(mockRiskAssessment(t)).toEqual(mockRiskAssessment(t));
  });

  it("segmentation splits numbered clauses", () => {
    const seg = mockSegmentation("ماده ۱ اول\n\nماده ۲ دوم\n\nماده ۳ سوم");
    expect(seg.clauses.length).toBeGreaterThanOrEqual(3);
  });

  it("negotiation report validates and only surfaces risky clauses", () => {
    const clauses = [
      { index: 0, text: "موضوع قرارداد ساده است", title: "موضوع" },
      { index: 1, text: "کارفرما مسئولیت نامحدود را به کارمند تحمیل می‌کند", title: "مسئولیت" },
    ];
    const assessments = clauses.map((c) => mockRiskAssessment(c.text, c.title));
    const report = mockNegotiationReport(clauses, assessments, "employee");
    expect(() => NegotiationReportResult.parse(report)).not.toThrow();
    expect(report.items.length).toBeGreaterThanOrEqual(1);
  });
});
