"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser, signIn, signUp, signOut, isAdmin, isApproved } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { recordEvent } from "@/lib/events/events";
import { restoreVersion, commitEdit } from "@/lib/events/versions";
import { segmentVersionClauses } from "@/lib/events/segment";
import { createBranch, mergeBranch } from "@/lib/events/branches";
import { scoreToSeverity } from "@/lib/risk/colors";
import { aggregateOverall } from "@/lib/risk/aggregate";
import { generateNegotiationReport, wargameReply, assistantReply, checkPolicyCompliance } from "@/lib/ai/providers";
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
  const msg = err instanceof Error ? err.message : "unexpected server error";
  // Map common live-provider failures to actionable Persian guidance.
  if (/no object generated|did not match schema|failed to parse|invalid json/i.test(msg)) {
    return "مدل انتخابی نتوانست پاسخ ساختارمند (JSON) تولید کند. معمولاً یعنی آن endpoint/مدل خروجی ساختاریافته را کامل پشتیبانی نمی‌کند — یک مدل توانمندتر انتخاب کنید یا دوباره تلاش کنید.";
  }
  if (/401|unauthorized|invalid api key|invalid_api_key|forbidden|403/i.test(msg)) {
    return "کلید API یا آدرس endpoint پذیرفته نشد. کلید، Base URL و نام مدل را در تنظیمات بررسی کنید.";
  }
  if (/404|not found|model_not_found|does not exist/i.test(msg)) {
    return "مدل یا endpoint یافت نشد. نام مدل و Base URL را بررسی کنید.";
  }
  return msg;
}

function revalidateContract(id: string) {
  revalidatePath(`/contracts/${id}`);
}

/**
 * Authorization gate for every contract-scoped mutation. Server actions are
 * publicly callable POST endpoints, so each one must independently verify:
 * signed-in → approved by an admin → admin or owner of the target contract.
 */
async function authorizeContract(contractId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "ابتدا وارد حساب کاربری شوید." };
  if (!isApproved(user)) return { ok: false as const, error: "حساب شما هنوز توسط مدیر تأیید نشده است." };
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract) return { ok: false as const, error: "قرارداد یافت نشد." };
  if (!isAdmin(user) && contract.ownerId && contract.ownerId !== user.id) {
    return { ok: false as const, error: "شما به این قرارداد دسترسی ندارید." };
  }
  return { ok: true as const, user, contract };
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
  try {
  const clause = await prisma.clause.findUnique({ where: { id: clauseId }, include: { version: true } });
  if (!clause) return { ok: false as const, error: "clause not found" };
  const authz = await authorizeContract(clause.version.contractId);
  if (!authz.ok) return authz;

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
          en: "After applying the suggested fix, this clause is now balanced and low-risk. (This change is applied only in the risk-analysis tab and does not affect the contract text.)",
        }),
      },
    });
    await refreshRunOverall(assessment.runId);
  }

  revalidateContract(clause.version.contractId);
  return { ok: true as const };
  } catch (err) {
    console.error("[applyFixAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

export async function restoreVersionAction(contractId: string, versionId: string) {
  try {
    const authz = await authorizeContract(contractId);
    if (!authz.ok) return authz;
    await restoreVersion({ contractId, targetVersionId: versionId, authorId: authz.user.id });
    revalidateContract(contractId);
    return { ok: true as const };
  } catch (err) {
    console.error("[restoreVersionAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

export async function createBranchAction(contractId: string, name: string) {
  try {
    const authz = await authorizeContract(contractId);
    if (!authz.ok) return authz;
    if (!authz.contract.headVersionId) return { ok: false as const, error: "no head version" };
    await createBranch({ contractId, name, baseVersionId: authz.contract.headVersionId, createdById: authz.user.id });
    revalidateContract(contractId);
    return { ok: true as const };
  } catch (err) {
    console.error("[createBranchAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

export async function mergeBranchAction(contractId: string, branchId: string) {
  try {
    const authz = await authorizeContract(contractId);
    if (!authz.ok) return authz;
    const result = await mergeBranch({ contractId, branchId, authorId: authz.user.id });
    revalidateContract(contractId);
    return { ok: true as const, merged: result.merged, conflicts: result.conflicts, branchName: result.branchName };
  } catch (err) {
    console.error("[mergeBranchAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

export async function toggleChecklistAction(itemId: string, done: boolean, contractId: string) {
  try {
    const authz = await authorizeContract(contractId);
    if (!authz.ok) return authz;
    // Scope the update to this contract so a stray/forged itemId is a no-op.
    await prisma.checklistItem.updateMany({
      where: { id: itemId, report: { contractId } },
      data: { done },
    });
    revalidateContract(contractId);
    return { ok: true as const };
  } catch (err) {
    console.error("[toggleChecklistAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

/** Accept a negotiation suggestion: lower the linked clause risk + log the event. */
export async function acceptNegotiationItemAction(itemId: string) {
  try {
  const item = await prisma.negotiationItem.findUnique({
    where: { id: itemId },
    include: { report: true },
  });
  if (!item) return { ok: false as const, error: "item not found" };
  const authz = await authorizeContract(item.report.contractId);
  if (!authz.ok) return authz;
  const user = authz.user;

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
    actorId: user.id,
    summary: `پذیرش پیشنهاد مذاکره${itemTitle.fa ? `: ${itemTitle.fa}` : ""}`,
    why: "اعمال نتیجه‌ی مذاکره و کاهش ریسک بند مربوطه.",
    metadata: { itemId, projectedRisk: item.projectedRisk },
  });

  revalidateContract(item.report.contractId);
  return { ok: true as const };
  } catch (err) {
    console.error("[acceptNegotiationItemAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

export async function generateNegotiationAction(contractId: string, perspective: Perspective) {
  try {
    const authz = await authorizeContract(contractId);
    if (!authz.ok) return authz;
    const contract = authz.contract;
    if (!contract.headVersionId) return { ok: false as const, error: "no head version" };

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

    // Replace any existing report for this perspective — atomically, so a
    // failure can never leave the user with no report (delete + recreate).
    const headVersionId = contract.headVersionId;
    const report = await prisma.$transaction(async (tx) => {
      await tx.negotiationReport.deleteMany({ where: { contractId, perspective } });
      const rep = await tx.negotiationReport.create({
        data: {
          contractId,
          versionId: headVersionId,
          perspective,
          counterparty,
          opportunityScore: result.opportunityScore,
          riskReductionPotential: result.riskReductionPotential,
          model: run?.model ?? "mock",
          talkingPointsJson: JSON.stringify(result.talkingPoints),
          items: {
            create: result.items.map((it) => ({
              clauseId: clauses.find((c) => c.index === it.clauseIndex)?.id ?? null,
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
            })),
          },
          checklist: {
            create: result.checklist.map((ch) => ({ label: JSON.stringify(ch.label), priority: ch.priority })),
          },
        },
      });
      return rep;
    });

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
    const authz = await authorizeContract(args.contractId);
    if (!authz.ok) return authz;
    const reply = await wargameReply({
      history: args.history,
      perspective: args.perspective,
      contractType: (authz.contract.type as ContractType) ?? "other",
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

/** Autosave: persist the working draft to the head version in place (no new version). */
export async function autosaveDocumentAction(contractId: string, content: string) {
  try {
    const authz = await authorizeContract(contractId);
    if (!authz.ok) return { ok: false as const, error: authz.error };
    if (!authz.contract.headVersionId) return { ok: false as const, error: "no head version" };
    await prisma.contractVersion.update({
      where: { id: authz.contract.headVersionId },
      data: { contentText: content, contentJson: buildContentJson(content) },
    });
    return { ok: true as const, savedAt: new Date().toISOString() };
  } catch (err) {
    console.error("[autosaveDocumentAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
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
    const authz = await authorizeContract(args.contractId);
    if (!authz.ok) return authz;
    if (!authz.contract.headVersionId) return { ok: false as const, error: "no head version" };
    const version = await commitEdit({
      contractId: args.contractId,
      parentVersionId: authz.contract.headVersionId,
      newContentJson: buildContentJson(args.content),
      newContentText: args.content,
      eventType: args.eventType,
      source: args.source,
      summary: args.summary,
      why: args.why ?? null,
      authorId: authz.user.id,
    });
    // commitEdit already re-segments the version's clauses.
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
    const authz = await authorizeContract(args.contractId);
    if (!authz.ok) return authz;
    const contract = authz.contract;
    const history = (args.history ?? []).slice(-6);
    const response = await assistantReply({
      document: args.document,
      message: args.message,
      history,
      contractType: (contract.type as ContractType) ?? "other",
      jurisdiction: contract.jurisdiction ?? null,
      language: contract.language ?? "fa",
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
    const authz = await authorizeContract(args.contractId);
    if (!authz.ok) return authz;
    const result = await checkPolicyCompliance({
      document: args.document,
      policies: args.policies,
      contractType: (authz.contract.type as ContractType) ?? "other",
      jurisdiction: authz.contract.jurisdiction ?? null,
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
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "ابتدا وارد حساب کاربری شوید." };
    if (!isApproved(user)) return { ok: false as const, error: "حساب شما هنوز توسط مدیر تأیید نشده است." };

    const title = args.title.trim().slice(0, 200);
    if (!title) return { ok: false as const, error: "title required" };
    const type = (CONTRACT_TYPES as readonly string[]).includes(args.type) ? args.type : "other";
    const content = (args.content ?? "").trim() || STARTER_DOC;

    // Attach to the user's own org (create + link one if the user has none,
    // so subsequent contracts reuse it instead of minting a new org each time).
    let org = user.orgId ? await prisma.organization.findUnique({ where: { id: user.orgId } }) : null;
    if (!org) {
      org = await prisma.organization.create({ data: { name: "فضای کاری من", slug: `org-${Date.now()}` } });
      await prisma.user.update({ where: { id: user.id }, data: { orgId: org.id } });
    }

    const contract = await prisma.contract.create({
      data: { orgId: org.id, ownerId: user.id, title, type, jurisdiction: "Iran", language: "fa", status: "draft" },
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

/** Delete a contract and all of its related records (owner or admin only). */
export async function deleteContractAction(contractId: string) {
  try {
    const authz = await authorizeContract(contractId);
    if (!authz.ok) return authz;
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
  try {
    const authz = await authorizeContract(contractId);
    if (!authz.ok) return authz;
    await recordEvent({
      contractId,
      type: "ai_suggestion_rejected",
      source: "human",
      actorId: authz.user.id,
      summary,
      why: "کاربر پیشنهاد هوش مصنوعی را رد کرد.",
    });
    revalidateContract(contractId);
    return { ok: true as const };
  } catch (err) {
    console.error("[logRejectionAction]", err);
    return { ok: false as const, error: actionError(err) };
  }
}

// ───────────────────────────── Auth ──────────────────────────────────────────

export async function signUpAction(input: { email: string; password: string; name?: string }) {
  try {
    const user = await signUp(input);
    // Tell the client whether to land on the app or the "pending approval" page.
    return { ok: true as const, approved: isApproved(user) };
  } catch (err) {
    return { ok: false as const, error: actionError(err) };
  }
}

export async function signInAction(input: { email: string; password: string }) {
  try {
    await signIn(input);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: actionError(err) };
  }
}

export async function signOutAction() {
  await signOut();
  return { ok: true as const };
}

// ───────────────────────── Per-user AI credentials ───────────────────────────

const AI_PROVIDERS = ["openai", "anthropic", "azure", "google", "openai-compatible"] as const;

/** Add a provider key for the current user (encrypted at rest) and activate it. */
export async function addCredentialAction(input: {
  label: string;
  provider: string;
  apiKey: string;
  baseUrl?: string;
  azureResource?: string;
  model?: string;
  modelFast?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "ابتدا وارد حساب کاربری شوید." };
    if (!(AI_PROVIDERS as readonly string[]).includes(input.provider)) {
      return { ok: false as const, error: "ارائه‌دهنده نامعتبر است." };
    }
    if (!input.apiKey.trim()) return { ok: false as const, error: "کلید API را وارد کنید." };

    const cred = await prisma.apiCredential.create({
      data: {
        userId: user.id,
        label: input.label.trim().slice(0, 60) || "کلید من",
        provider: input.provider,
        apiKeyEnc: encryptSecret(input.apiKey.trim()),
        baseUrl: input.baseUrl?.trim() || null,
        azureResource: input.azureResource?.trim() || null,
        model: input.model?.trim() || null,
        modelFast: input.modelFast?.trim() || null,
        isActive: true,
      },
    });
    // Only one active credential at a time.
    await prisma.apiCredential.updateMany({
      where: { userId: user.id, id: { not: cred.id } },
      data: { isActive: false },
    });
    revalidatePath("/settings");
    return { ok: true as const, id: cred.id };
  } catch (err) {
    return { ok: false as const, error: actionError(err) };
  }
}

/** Switch which credential is active (or pass null to fall back to mock/env). */
export async function activateCredentialAction(credentialId: string | null) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "unauthorized" };
  await prisma.apiCredential.updateMany({ where: { userId: user.id }, data: { isActive: false } });
  if (credentialId) {
    await prisma.apiCredential.updateMany({
      where: { id: credentialId, userId: user.id },
      data: { isActive: true },
    });
  }
  revalidatePath("/settings");
  return { ok: true as const };
}

export async function deleteCredentialAction(credentialId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "unauthorized" };
  await prisma.apiCredential.deleteMany({ where: { id: credentialId, userId: user.id } });
  revalidatePath("/settings");
  return { ok: true as const };
}

// ───────────────────────────── Admin (user management) ───────────────────────

/** Guard: resolve the current user and ensure they are a global admin. */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return null;
  return user;
}

/** Approve or revoke a user's access to the app (admin only). */
export async function setUserApprovedAction(userId: string, approved: boolean) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "دسترسی مدیر لازم است." };
  await prisma.user.update({ where: { id: userId }, data: { approved } });
  revalidatePath("/admin");
  return { ok: true as const };
}

/** Promote a user to admin, or demote back to an approved member (admin only). */
export async function setUserRoleAction(userId: string, makeAdmin: boolean) {
  const admin = await requireAdmin();
  if (!admin) return { ok: false as const, error: "دسترسی مدیر لازم است." };
  if (userId === admin.id && !makeAdmin) {
    return { ok: false as const, error: "نمی‌توانید نقش مدیریتی خود را حذف کنید." };
  }
  await prisma.user.update({
    where: { id: userId },
    // Promoting also approves; a member keeps their approved state on demotion.
    data: makeAdmin ? { role: "admin", approved: true } : { role: "member" },
  });
  revalidatePath("/admin");
  return { ok: true as const };
}

export async function setLocaleAction(locale: "fa" | "en") {
  const store = await cookies();
  store.set("locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true as const };
}
