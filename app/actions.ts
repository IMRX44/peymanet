"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { recordEvent } from "@/lib/events/events";
import { restoreVersion } from "@/lib/events/versions";
import { createBranch, mergeBranch } from "@/lib/events/branches";
import { wordDiff } from "@/lib/diff/textDiff";
import { scoreToSeverity } from "@/lib/risk/colors";
import { aggregateOverall } from "@/lib/risk/aggregate";
import { generateNegotiationReport, wargameReply } from "@/lib/ai/providers";
import { fromJson } from "@/lib/db/json";
import type {
  RiskCategory,
  Severity,
  Perspective,
  RiskAssessmentResult,
  ContractType,
} from "@/lib/ai/schemas";
import { PERSPECTIVE_PAIRS } from "@/lib/constants";

function revalidateContract(id: string) {
  revalidatePath(`/contracts/${id}`);
}

/** Recompute and persist a run's overall risk after a clause score change. */
async function refreshRunOverall(runId: string) {
  const all = await prisma.riskAssessment.findMany({ where: { runId } });
  const overall = aggregateOverall(
    all.map((a) => ({
      riskScore: a.riskScore,
      severity: a.severity as Severity,
      confidence: a.confidence,
      categories: fromJson<RiskCategory[]>(a.categoriesJson, []),
    })),
  );
  await prisma.analysisRun.update({ where: { id: runId }, data: { overallRisk: overall } });
}

/** Apply the AI-suggested alternative clause; lower its risk; log a timeline event. */
export async function applyFixAction(clauseId: string) {
  const user = await getCurrentUser();
  const clause = await prisma.clause.findUnique({ where: { id: clauseId }, include: { version: true } });
  if (!clause) return { ok: false as const, error: "clause not found" };

  const assessment = await prisma.riskAssessment.findFirst({
    where: { clauseId },
    orderBy: { createdAt: "desc" },
  });
  const newText = assessment?.alternativeClause || clause.text;
  const diff = wordDiff(clause.text, newText);

  await prisma.clause.update({ where: { id: clauseId }, data: { text: newText } });

  if (assessment) {
    const newScore = Math.max(12, Math.round(assessment.riskScore * 0.35));
    await prisma.riskAssessment.update({
      where: { id: assessment.id },
      data: {
        riskScore: newScore,
        severity: scoreToSeverity(newScore),
        explanation: JSON.stringify({
          fa: "این بند پس از اعمال اصلاح پیشنهادی، اکنون متوازن و کم‌ریسک است.",
          en: "After applying the suggested fix, this clause is now balanced and low-risk.",
        }),
      },
    });
    await refreshRunOverall(assessment.runId);
  }

  await recordEvent({
    contractId: clause.version.contractId,
    type: "fix_applied",
    source: "ai",
    actorId: user?.id,
    summary: `اعمال اصلاح روی «${clause.title ?? `بند ${clause.index + 1}`}»`,
    why: "جایگزینی بند پرریسک با نسخه‌ی پیشنهادی هوش مصنوعی.",
    versionId: clause.versionId,
    diff,
    metadata: { clauseId, clauseIndex: clause.index },
  });

  revalidateContract(clause.version.contractId);
  return { ok: true as const };
}

export async function restoreVersionAction(contractId: string, versionId: string) {
  const user = await getCurrentUser();
  await restoreVersion({ contractId, targetVersionId: versionId, authorId: user?.id });
  revalidateContract(contractId);
  return { ok: true as const };
}

export async function createBranchAction(contractId: string, name: string) {
  const user = await getCurrentUser();
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract?.headVersionId) return { ok: false as const, error: "no head version" };
  await createBranch({ contractId, name, baseVersionId: contract.headVersionId, createdById: user?.id });
  revalidateContract(contractId);
  return { ok: true as const };
}

export async function mergeBranchAction(contractId: string, branchId: string) {
  const user = await getCurrentUser();
  const result = await mergeBranch({ contractId, branchId, authorId: user?.id });
  revalidateContract(contractId);
  return { ok: true as const, merged: result.merged, conflicts: result.conflicts, branchName: result.branchName };
}

export async function toggleChecklistAction(itemId: string, done: boolean, contractId: string) {
  await prisma.checklistItem.update({ where: { id: itemId }, data: { done } });
  revalidateContract(contractId);
  return { ok: true as const };
}

/** Accept a negotiation suggestion: lower the linked clause risk + log the event. */
export async function acceptNegotiationItemAction(itemId: string) {
  const user = await getCurrentUser();
  const item = await prisma.negotiationItem.findUnique({
    where: { id: itemId },
    include: { report: true },
  });
  if (!item) return { ok: false as const, error: "item not found" };

  await prisma.negotiationItem.update({ where: { id: itemId }, data: { accepted: true } });

  // Cross-feature integration: reflect the projected risk on the heatmap.
  if (item.clauseId) {
    const assessment = await prisma.riskAssessment.findFirst({
      where: { clauseId: item.clauseId },
      orderBy: { createdAt: "desc" },
    });
    if (assessment) {
      await prisma.riskAssessment.update({
        where: { id: assessment.id },
        data: { riskScore: item.projectedRisk, severity: scoreToSeverity(item.projectedRisk) },
      });
      await refreshRunOverall(assessment.runId);
    }
  }

  const itemTitle = fromJson<{ fa: string; en: string }>(item.title, { fa: "", en: "" });
  await recordEvent({
    contractId: item.report.contractId,
    type: "negotiation_accepted",
    source: "human",
    actorId: user?.id,
    summary: `پذیرش پیشنهاد مذاکره${itemTitle.fa ? `: ${itemTitle.fa}` : ""}`,
    why: "اعمال نتیجه‌ی مذاکره و کاهش ریسک بند مربوطه.",
    metadata: { itemId, projectedRisk: item.projectedRisk },
  });

  revalidateContract(item.report.contractId);
  return { ok: true as const };
}

export async function generateNegotiationAction(contractId: string, perspective: Perspective) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract?.headVersionId) return { ok: false as const, error: "no head version" };

  const clauses = await prisma.clause.findMany({
    where: { versionId: contract.headVersionId },
    orderBy: { index: "asc" },
  });
  const run = await prisma.analysisRun.findFirst({
    where: { contractId, status: "completed" },
    orderBy: { createdAt: "desc" },
  });
  const assessmentRows = run ? await prisma.riskAssessment.findMany({ where: { runId: run.id } }) : [];
  const byClause = new Map(assessmentRows.map((a) => [a.clauseId, a]));

  const assessments: RiskAssessmentResult[] = clauses.map((c) => {
    const a = byClause.get(c.id);
    return {
      riskScore: a?.riskScore ?? 30,
      severity: (a?.severity as Severity) ?? "medium",
      confidence: a?.confidence ?? 0.8,
      categories: fromJson<RiskCategory[]>(a?.categoriesJson ?? "[]", ["legal"]),
      citation: a?.citation ?? null,
      explanation: fromJson(a?.explanation ?? "", { fa: "", en: "" }),
      reasoning: fromJson(a?.reasoning ?? "", { fa: "", en: "" }),
      suggestedFix: a?.suggestedFix ? fromJson(a.suggestedFix, { fa: "", en: "" }) : null,
      alternativeClause: a?.alternativeClause ?? null,
    };
  });

  const result = await generateNegotiationReport({
    clauses: clauses.map((c) => ({ index: c.index, title: c.title, text: c.text })),
    assessments,
    perspective,
    contractType: contract.type as ContractType,
    jurisdiction: contract.jurisdiction,
    contractId,
  });

  const pair = PERSPECTIVE_PAIRS[contract.type as ContractType];
  const counterparty = pair ? (pair[0] === perspective ? pair[1] : pair[0]) : null;

  // Replace any existing report for this perspective.
  await prisma.negotiationReport.deleteMany({ where: { contractId, perspective } });
  const report = await prisma.negotiationReport.create({
    data: {
      contractId,
      versionId: contract.headVersionId,
      perspective,
      counterparty,
      opportunityScore: result.opportunityScore,
      riskReductionPotential: result.riskReductionPotential,
      model: run?.model ?? "mock",
      talkingPointsJson: JSON.stringify(result.talkingPoints),
    },
  });
  for (const it of result.items) {
    const clause = clauses.find((c) => c.index === it.clauseIndex);
    await prisma.negotiationItem.create({
      data: {
        reportId: report.id,
        clauseId: clause?.id ?? null,
        title: JSON.stringify(it.title),
        currentRisk: it.currentRisk,
        projectedRisk: it.projectedRisk,
        oneSided: it.oneSided,
        unfair: it.unfair,
        exploitable: it.exploitable,
        suggestedChange: JSON.stringify(it.suggestedChange),
        strategy: JSON.stringify(it.strategy),
        expectedCounterArgument: JSON.stringify(it.expectedCounterArgument),
        suggestedResponse: JSON.stringify(it.suggestedResponse),
        winProbability: it.winProbability,
        difficulty: it.difficulty,
        businessImpact: it.businessImpact,
        legalImpact: it.legalImpact,
      },
    });
  }
  for (const ch of result.checklist) {
    await prisma.checklistItem.create({
      data: { reportId: report.id, label: JSON.stringify(ch.label), priority: ch.priority },
    });
  }

  revalidateContract(contractId);
  return { ok: true as const, reportId: report.id };
}

export async function wargameAction(args: {
  contractId: string;
  perspective: Perspective;
  history: { role: "user" | "assistant"; content: string }[];
}) {
  const contract = await prisma.contract.findUnique({ where: { id: args.contractId } });
  const reply = await wargameReply({
    history: args.history,
    perspective: args.perspective,
    contractType: (contract?.type as ContractType) ?? "other",
  });
  return { ok: true as const, reply };
}

export async function setLocaleAction(locale: "fa" | "en") {
  const store = await cookies();
  store.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
