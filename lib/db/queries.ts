import { prisma } from "@/lib/db/prisma";
import { fromJson } from "@/lib/db/json";
import { localize } from "@/lib/i18n/localize";
import { aiMode } from "@/lib/ai/models";
import type { RiskCategory, Severity, Difficulty, Impact, Perspective } from "@/lib/ai/schemas";
import type { DiffSegment } from "@/lib/diff/textDiff";

export type RiskView = {
  assessmentId: string;
  score: number;
  severity: Severity;
  confidence: number;
  categories: RiskCategory[];
  citation: string | null;
  explanation: string;
  reasoning: string;
  suggestedFix: string | null;
  alternativeClause: string | null;
};

export type WorkspaceClause = {
  id: string;
  index: number;
  title: string | null;
  type: string | null;
  text: string;
  startOffset: number;
  endOffset: number;
  risk: RiskView | null;
};

export type TimelineEventView = {
  id: string;
  type: string;
  source: string;
  actorName: string | null;
  summary: string;
  why: string | null;
  createdAt: string;
  versionId: string | null;
  branchId: string | null;
  diff: { added: number; removed: number; segments: DiffSegment[] } | null;
};

export type NegotiationItemView = {
  id: string;
  clauseId: string | null;
  title: string;
  currentRisk: number;
  projectedRisk: number;
  oneSided: boolean;
  unfair: boolean;
  exploitable: boolean;
  suggestedChange: string;
  strategy: string;
  expectedCounterArgument: string;
  suggestedResponse: string;
  winProbability: number;
  difficulty: Difficulty;
  businessImpact: Impact;
  legalImpact: Impact;
  accepted: boolean;
};

export type NegotiationView = {
  id: string;
  perspective: Perspective;
  counterparty: string | null;
  opportunityScore: number;
  riskReductionPotential: number;
  talkingPoints: string[];
  items: NegotiationItemView[];
  checklist: { id: string; label: string; done: boolean; priority: number }[];
};

export type WorkspaceData = {
  aiMode: "mock" | "openai";
  locale: string;
  contract: { id: string; title: string; type: string; jurisdiction: string | null; language: string; status: string };
  version: { id: string; versionNumber: number; contentText: string } | null;
  clauses: WorkspaceClause[];
  analysis: {
    runId: string;
    overallRisk: number;
    headline: string;
    analyzedAt: string | null;
    changesSince: number;
    missingClauses: { type: string; importance: Severity; rationale: string; suggestedText: string | null }[];
    complianceIssues: { framework: string; severity: Severity; description: string; remediation: string | null }[];
    recommendations: { priority: Impact; title: string; description: string }[];
  } | null;
  timeline: {
    events: TimelineEventView[];
    branches: { id: string; name: string; status: string; color: string | null; headVersionId: string | null; baseVersionId: string | null }[];
    versions: { id: string; versionNumber: number; message: string | null; source: string; branchId: string | null; createdAt: string; contentText: string }[];
  };
  negotiation: NegotiationView | null;
};

export async function getContractIds(): Promise<string[]> {
  const rows = await prisma.contract.findMany({ select: { id: true } });
  return rows.map((r) => r.id);
}

export async function listContracts(locale: string) {
  const contracts = await prisma.contract.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      analysisRuns: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { versions: true } },
    },
  });
  return contracts.map((c) => ({
    id: c.id,
    title: c.title,
    type: c.type,
    status: c.status,
    overallRisk: c.analysisRuns[0]?.overallRisk ?? null,
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export async function getWorkspace(contractId: string, locale: string): Promise<WorkspaceData | null> {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) return null;

  const version = contract.headVersionId
    ? await prisma.contractVersion.findUnique({ where: { id: contract.headVersionId } })
    : await prisma.contractVersion.findFirst({ where: { contractId, branchId: null }, orderBy: { versionNumber: "desc" } });

  const clauses = version
    ? await prisma.clause.findMany({ where: { versionId: version.id }, orderBy: { index: "asc" } })
    : [];

  // Latest completed analysis run for this version (fallback: latest run).
  const run =
    (version &&
      (await prisma.analysisRun.findFirst({
        where: { contractId, versionId: version.id, status: "completed" },
        orderBy: { createdAt: "desc" },
      }))) ||
    (await prisma.analysisRun.findFirst({ where: { contractId, status: "completed" }, orderBy: { createdAt: "desc" } }));

  const assessments = run
    ? await prisma.riskAssessment.findMany({ where: { runId: run.id } })
    : [];
  const assessmentByClause = new Map(assessments.map((a) => [a.clauseId, a]));

  const clauseViews: WorkspaceClause[] = clauses.map((c) => {
    const a = assessmentByClause.get(c.id);
    return {
      id: c.id,
      index: c.index,
      title: c.title,
      type: c.type,
      text: c.text,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
      risk: a
        ? {
            assessmentId: a.id,
            score: a.riskScore,
            severity: a.severity as Severity,
            confidence: a.confidence,
            categories: fromJson<RiskCategory[]>(a.categoriesJson, []),
            citation: a.citation,
            explanation: localize(a.explanation, locale),
            reasoning: localize(a.reasoning, locale),
            suggestedFix: a.suggestedFix ? localize(a.suggestedFix, locale) : null,
            alternativeClause: a.alternativeClause,
          }
        : null,
    };
  });

  let analysis: WorkspaceData["analysis"] = null;
  if (run) {
    const [missing, compliance, recs] = await Promise.all([
      prisma.missingClause.findMany({ where: { runId: run.id } }),
      prisma.complianceIssue.findMany({ where: { runId: run.id } }),
      prisma.recommendation.findMany({ where: { runId: run.id } }),
    ]);
    const summary = fromJson<{ headline?: { fa: string; en: string } }>(run.summaryJson, {});
    // How many trunk document versions were saved after this analysis completed.
    const changesSince = run.completedAt
      ? await prisma.contractVersion.count({ where: { contractId, branchId: null, createdAt: { gt: run.completedAt } } })
      : 0;
    analysis = {
      runId: run.id,
      overallRisk: run.overallRisk ?? 0,
      headline: summary.headline ? (locale === "en" ? summary.headline.en : summary.headline.fa) : "",
      analyzedAt: (run.completedAt ?? run.createdAt).toISOString(),
      changesSince,
      missingClauses: missing.map((m) => ({
        type: m.type,
        importance: m.importance as Severity,
        rationale: localize(m.rationale, locale),
        suggestedText: m.suggestedText,
      })),
      complianceIssues: compliance.map((c) => ({
        framework: c.framework,
        severity: c.severity as Severity,
        description: localize(c.description, locale),
        remediation: c.remediation ? localize(c.remediation, locale) : null,
      })),
      recommendations: recs.map((r) => ({
        priority: r.priority as Impact,
        title: localize(r.title, locale),
        description: localize(r.description, locale),
      })),
    };
  }

  const [events, branches, versions, report] = await Promise.all([
    prisma.timelineEvent.findMany({
      where: { contractId },
      orderBy: { createdAt: "asc" },
      include: { actor: true },
    }),
    prisma.branch.findMany({ where: { contractId }, orderBy: { createdAt: "asc" } }),
    prisma.contractVersion.findMany({ where: { contractId }, orderBy: { versionNumber: "asc" } }),
    prisma.negotiationReport.findFirst({
      where: { contractId },
      orderBy: { createdAt: "desc" },
      include: { items: { orderBy: { currentRisk: "desc" } }, checklist: { orderBy: { priority: "asc" } } },
    }),
  ]);

  const negotiation: NegotiationView | null = report
    ? {
        id: report.id,
        perspective: report.perspective as Perspective,
        counterparty: report.counterparty,
        opportunityScore: report.opportunityScore,
        riskReductionPotential: report.riskReductionPotential,
        talkingPoints: fromJson<{ fa: string; en: string }[]>(report.talkingPointsJson, []).map((t) =>
          locale === "en" ? t.en : t.fa,
        ),
        items: report.items.map((it) => ({
          id: it.id,
          clauseId: it.clauseId,
          title: localize(it.title, locale),
          currentRisk: it.currentRisk,
          projectedRisk: it.projectedRisk,
          oneSided: it.oneSided,
          unfair: it.unfair,
          exploitable: it.exploitable,
          suggestedChange: localize(it.suggestedChange, locale),
          strategy: localize(it.strategy, locale),
          expectedCounterArgument: localize(it.expectedCounterArgument, locale),
          suggestedResponse: localize(it.suggestedResponse, locale),
          winProbability: it.winProbability,
          difficulty: it.difficulty as Difficulty,
          businessImpact: it.businessImpact as Impact,
          legalImpact: it.legalImpact as Impact,
          accepted: it.accepted,
        })),
        checklist: report.checklist.map((ch) => ({
          id: ch.id,
          label: localize(ch.label, locale),
          done: ch.done,
          priority: ch.priority,
        })),
      }
    : null;

  return {
    aiMode: aiMode(),
    locale,
    contract: {
      id: contract.id,
      title: contract.title,
      type: contract.type,
      jurisdiction: contract.jurisdiction,
      language: contract.language,
      status: contract.status,
    },
    version: version ? { id: version.id, versionNumber: version.versionNumber, contentText: version.contentText } : null,
    clauses: clauseViews,
    analysis,
    timeline: {
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        source: e.source,
        actorName: e.actor?.name ?? null,
        summary: e.summary,
        why: e.why,
        createdAt: e.createdAt.toISOString(),
        versionId: e.versionId,
        branchId: e.branchId,
        diff: e.diffJson ? fromJson<{ added: number; removed: number; segments: DiffSegment[] }>(e.diffJson, { added: 0, removed: 0, segments: [] }) : null,
      })),
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        status: b.status,
        color: b.color,
        headVersionId: b.headVersionId,
        baseVersionId: b.baseVersionId,
      })),
      versions: versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        message: v.message,
        source: v.source,
        branchId: v.branchId,
        createdAt: v.createdAt.toISOString(),
        contentText: v.contentText,
      })),
    },
    negotiation,
  };
}
