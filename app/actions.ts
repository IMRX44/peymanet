"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth";
import { recordEvent } from "@/lib/events/events";
import { restoreVersion, commitEdit } from "@/lib/events/versions";
import { createBranch, mergeBranch } from "@/lib/events/branches";
import { scoreToSeverity } from "@/lib/risk/colors";
import { aggregateOverall } from "@/lib/risk/aggregate";
import { generateNegotiationReport, wargameReply, assistantReply, checkPolicyCompliance } from "@/lib/ai/providers";
import { mockSegmentation } from "@/lib/ai/mock";
import { MODELS, estimateCost } from "@/lib/ai/models";
import { createVersion } from "@/lib/events/versions";
import { fromJson } from "@/lib/db/json";
import type {
  RiskCategory,
  Severity,
  Perspective,
  RiskAssessmentResult,
  ContractType,
  AiSource,
  EventType,
} from "@/lib/ai/schemas";
import { CONTRACT_TYPES } from "@/lib/ai/schemas";
import { PERSPECTIVE_PAIRS } from "@/lib/constants";

function actionError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "unexpected server error";
}

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

/**
 * Apply the AI-suggested alternative clause WITHIN the risk-analysis tab only.
 * This updates the clause's analysis text + lowers its assessed risk, but it does
 * NOT touch the editable contract document or append a contract timeline event —
 * the fix is a what-if applied to the risk view, not a change to the contract.
 */
export async function applyFixAction(clauseId: string) {
  const clause = await prisma.clause.findUnique({ where: { id: clauseId }, include: { version: true } });
  if (!clause) return { ok: false as const, error: "clause not found" };

  const assessment = await prisma.riskAssessment.findFirst({
    where: { clauseId },
    orderBy: { createdAt: "desc" },
  });
  const newText = assessment?.alternativeClause || clause.text;

  await prisma.clause.update({ where: { id: clauseId }, data: { text: newText } });

  if (assessment) {
    const newScore = Math.max(12, Math.round(assessment.riskScore * 0.35));
    await prisma.riskAssessment.update({
      where: { id: assessment.id },
      data: {
        riskScore: newScore,
        severity: scoreToSeverity(newScore),
        explanation: JSON.stringify({
          fa: "این بند پس از اعمال اصلاح پیشنهادی، اکنون متوازن و کم‌ریسک است. (این تغییر فقط در تب تحلیل ریسک اعمال شده و روی متن قرارداد اثری ندارد.)",
          en: "این بند پس از اعمال اصلاح پیشنهادی، اکنون متوازن و کم‌ریسک است. (این تغییر فقط در تب تحلیل ریسک اعمال شده و روی متن قرارداد اثری ندارد.)",
        }),
      },
    });
    await refreshRunOverall(assessment.runId);
  }

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
  try {
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
  } catch (err) {
    console.error("[generateNegotiationAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

export async function wargameAction(args: {
  contractId: string;
  perspective: Perspective;
  history: { role: "user" | "assistant"; content: string }[];
}) {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: args.contractId } });
    const reply = await wargameReply({
      history: args.history,
      perspective: args.perspective,
      contractType: (contract?.type as ContractType) ?? "other",
    });
    return { ok: true as const, reply };
  } catch (err) {
    console.error("[wargameAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

// ───────────────────────────── Editor (document) actions ─────────────────────

function buildContentJson(content: string): string {
  return JSON.stringify({ markdown: content });
}

/** Re-segment a version's text into Clause rows (keeps the analysis view consistent). */
async function segmentVersionClauses(versionId: string, contentText: string) {
  const seg = mockSegmentation(contentText);
  let cursor = 0;
  for (const c of seg.clauses) {
    const idx = contentText.indexOf(c.text, cursor);
    const start = idx >= 0 ? idx : cursor;
    const end = start + c.text.length;
    cursor = end;
    await prisma.clause.create({
      data: { versionId, index: c.index, title: c.title ?? null, type: c.type ?? null, text: c.text, startOffset: start, endOffset: end },
    });
  }
}

/** Autosave: persist the working draft to the head version in place (no new version). */
export async function autosaveDocumentAction(contractId: string, content: string) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract?.headVersionId) return { ok: false as const };
  await prisma.contractVersion.update({
    where: { id: contract.headVersionId },
    data: { contentText: content, contentJson: buildContentJson(content) },
  });
  return { ok: true as const, savedAt: new Date().toISOString() };
}

/** Commit a new immutable version from the editor (manual save or accepted AI edit). */
export async function commitDocumentAction(args: {
  contractId: string;
  content: string;
  source: AiSource;
  eventType: EventType;
  summary: string;
  why?: string;
}) {
  try {
    const user = await getCurrentUser();
    const contract = await prisma.contract.findUnique({ where: { id: args.contractId } });
    if (!contract?.headVersionId) return { ok: false as const, error: "no head version" };
    const version = await commitEdit({
      contractId: args.contractId,
      parentVersionId: contract.headVersionId,
      newContentJson: buildContentJson(args.content),
      newContentText: args.content,
      eventType: args.eventType,
      source: args.source,
      summary: args.summary,
      why: args.why ?? null,
      authorId: user?.id,
    });
    await segmentVersionClauses(version.id, args.content);
    revalidateContract(args.contractId);
    return { ok: true as const, versionId: version.id };
  } catch (err) {
    console.error("[commitDocumentAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

/** Document-aware assistant turn (no mutation). Carries up to 6 messages of chat memory. */
export async function assistantAction(args: {
  contractId: string;
  document: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}) {
  try {
    const contract = await prisma.contract.findUnique({ where: { id: args.contractId } });
    const history = (args.history ?? []).slice(-6);
    const response = await assistantReply({
      document: args.document,
      message: args.message,
      history,
      contractType: (contract?.type as ContractType) ?? "other",
      jurisdiction: contract?.jurisdiction ?? null,
      language: contract?.language ?? "fa",
      contractId: args.contractId,
    });

    // Estimate this turn's cost so the UI can show per-chat spend.
    const promptChars = args.document.length + args.message.length + history.reduce((s, m) => s + m.content.length, 0) + 600;
    const completionChars = JSON.stringify(response).length;
    const costUsd = estimateCost(MODELS.deep, Math.ceil(promptChars / 4), Math.ceil(completionChars / 4));

    return { ok: true as const, response, costUsd };
  } catch (err) {
    console.error("[assistantAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

/** Check the current document against free-text organization policies (risk tab). */
export async function checkPolicyComplianceAction(args: { contractId: string; document: string; policies: string }) {
  try {
    if (!args.policies.trim()) return { ok: false as const, error: "no policies provided" };
    const contract = await prisma.contract.findUnique({ where: { id: args.contractId } });
    const result = await checkPolicyCompliance({
      document: args.document,
      policies: args.policies,
      contractType: (contract?.type as ContractType) ?? "other",
      jurisdiction: contract?.jurisdiction ?? null,
      contractId: args.contractId,
    });
    return { ok: true as const, result };
  } catch (err) {
    console.error("[checkPolicyComplianceAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

// ───────────────────────────── Contract management (create / delete) ─────────

const STARTER_DOC =
  "ماده ۱ - موضوع قرارداد\nموضوع این قرارداد عبارت است از …\n\nماده ۲ - مدت قرارداد\nمدت این قرارداد از تاریخ … تا تاریخ … است.\n\nماده ۳ - مبلغ و نحوهٔ پرداخت\nمبلغ کل قرارداد … ریال است که به‌صورت … پرداخت می‌شود.";

/** Create a new contract with an initial version + segmented clauses + a "created" event. */
export async function createContractAction(args: { title: string; type: string; content?: string }) {
  try {
    const title = args.title.trim();
    if (!title) return { ok: false as const, error: "title required" };
    const type = (CONTRACT_TYPES as readonly string[]).includes(args.type) ? args.type : "other";
    const content = (args.content ?? "").trim() || STARTER_DOC;

    const user = await getCurrentUser();
    // Attach to the first org (single-tenant demo); create one if none exists.
    const org =
      (await prisma.organization.findFirst()) ??
      (await prisma.organization.create({ data: { name: "سازمان پیمانت", slug: `org-${Date.now()}` } }));

    const contract = await prisma.contract.create({
      data: { orgId: org.id, title, type, jurisdiction: "Iran", language: "fa", status: "draft" },
    });

    const version = await createVersion({
      contractId: contract.id,
      contentJson: JSON.stringify({ markdown: content }),
      contentText: content,
      source: "human",
      authorId: user?.id,
      message: "پیش‌نویس اولیه قرارداد",
    });
    await segmentVersionClauses(version.id, content);

    await recordEvent({
      contractId: contract.id,
      type: "created",
      source: "human",
      actorId: user?.id,
      summary: "قرارداد جدید ایجاد شد",
      why: "ایجاد قرارداد جدید توسط کاربر.",
      versionId: version.id,
    });

    revalidatePath("/contracts");
    return { ok: true as const, contractId: contract.id };
  } catch (err) {
    console.error("[createContractAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

/** Delete a contract and all of its related records. */
export async function deleteContractAction(contractId: string) {
  try {
    // Break the Contract.headVersion self-relation before cascade delete.
    await prisma.contract.update({ where: { id: contractId }, data: { headVersionId: null } });
    await prisma.contract.delete({ where: { id: contractId } });
    revalidatePath("/contracts");
    return { ok: true as const };
  } catch (err) {
    console.error("[deleteContractAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

/** Audit: record that the user rejected an AI suggestion. */
export async function logRejectionAction(contractId: string, summary: string) {
  const user = await getCurrentUser();
  await recordEvent({
    contractId,
    type: "ai_suggestion_rejected",
    source: "human",
    actorId: user?.id,
    summary,
    why: "کاربر پیشنهاد هوش مصنوعی را رد کرد.",
  });
  revalidateContract(contractId);
  return { ok: true as const };
}

export async function setLocaleAction(locale: "fa" | "en") {
  const store = await cookies();
  store.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
