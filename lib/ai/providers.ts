import { z } from "zod";
import { estimateCost } from "@/lib/ai/models";
import { resolveAi } from "@/lib/ai/resolve";
import { cacheKey, getCached, setCached } from "@/lib/ai/cache";
import { prisma } from "@/lib/db/prisma";
import {
  SegmentationResult,
  RiskAssessmentResult,
  DocSummaryResult,
  NegotiationReportResult,
  AssistantResponse,
  AssistantResponseLlm,
  PolicyComplianceResult,
  type Perspective,
} from "@/lib/ai/schemas";
import {
  mockSegmentation,
  mockRiskAssessment,
  mockDocSummary,
  mockNegotiationReport,
  mockWargameReply,
  mockAssistant,
  mockPolicyCompliance,
} from "@/lib/ai/mock";
import * as P from "@/lib/ai/prompts";
import { PERSPECTIVE_LABELS, PERSPECTIVE_PAIRS } from "@/lib/constants";
import type { ContractType } from "@/lib/ai/schemas";

async function logCall(
  task: string,
  model: string,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
  ok: boolean,
  contractId?: string,
  userId?: string,
) {
  try {
    await prisma.aiCall.create({
      data: {
        contractId,
        userId,
        task,
        model,
        promptTokens,
        completionTokens,
        costUsd: estimateCost(model, promptTokens, completionTokens),
        latencyMs,
        ok,
      },
    });
  } catch {
    // observability is best-effort
  }
}

/** Rough token estimate (~4 chars/token) for logging mock-mode usage. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Salvage a JSON object from a model reply that wrapped it in markdown fences
 * or surrounding prose. Many OpenAI-compatible endpoints / open models do this,
 * which otherwise triggers "No object generated: response did not match schema".
 * Returns the extracted JSON string, or null to let the SDK report the error.
 */
async function repairToJson({ text }: { text: string }): Promise<string | null> {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) t = fenced[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return null;
}

/**
 * Core helper: run a structured-output task with caching + logging, switching
 * between deterministic mock and live OpenAI based on AI_MODE.
 */
async function runObject<T>(opts: {
  task: string;
  tier: "deep" | "fast";
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  cacheInput: string;
  mock: () => T;
  contractId?: string;
}): Promise<T> {
  const ai = await resolveAi();
  const model = opts.tier === "deep" ? ai.deep : ai.fast;
  const key = cacheKey(opts.task, model, opts.cacheInput);
  const cached = await getCached<T>(key);
  if (cached) return cached;

  let value: T;
  if (ai.mode === "mock") {
    // Log mock runs too (cost is $0 for the "mock" model) so the admin per-user
    // usage view is populated even without a live key.
    const started = Date.now();
    value = opts.mock();
    await logCall(
      opts.task,
      model,
      estimateTokens(opts.system + opts.prompt),
      estimateTokens(JSON.stringify(value)),
      Date.now() - started,
      true,
      opts.contractId,
      ai.userId,
    );
  } else {
    const started = Date.now();
    // Lazy import so the AI SDK is only loaded in live mode.
    const { getLanguageModel } = await import("@/lib/ai/client");
    const { generateObject } = await import("ai");
    // Third-party OpenAI-compatible endpoints (reseller / proxy / gateway / local)
    // frequently don't support OpenAI structured outputs (response_format
    // json_schema). Fall back to plain JSON mode + a repair pass so they work.
    const compatible = ai.provider === "openai-compatible" || (ai.provider === "openai" && !!ai.baseUrl);
    try {
      const result = await generateObject({
        model: await getLanguageModel(ai, model),
        schema: opts.schema as z.ZodType<T>,
        ...(compatible ? { mode: "json" as const } : {}),
        experimental_repairText: repairToJson,
        system: opts.system,
        prompt: opts.prompt,
      });
      const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number } }).usage;
      await logCall(
        opts.task,
        model,
        usage?.promptTokens ?? 0,
        usage?.completionTokens ?? 0,
        Date.now() - started,
        true,
        opts.contractId,
        ai.userId,
      );
      value = result.object as T;
    } catch (err) {
      await logCall(opts.task, model, 0, 0, Date.now() - started, false, opts.contractId, ai.userId);
      throw err;
    }
  }

  await setCached(key, opts.task, model, value);
  return value;
}

// ───────────────────────────── Public API ─────────────────────────────

export async function segmentContract(text: string): Promise<SegmentationResult> {
  return runObject({
    task: "segment",
    tier: "fast",
    system: P.segmentationSystemPrompt(),
    prompt: P.segmentationUserPrompt(text),
    schema: SegmentationResult,
    cacheInput: text,
    mock: () => mockSegmentation(text),
  });
}

export async function analyzeClauseRisk(args: {
  index: number;
  title: string | null;
  text: string;
  contractType: ContractType;
  jurisdiction: string | null;
  language: string;
  contractId?: string;
}): Promise<RiskAssessmentResult> {
  return runObject({
    task: "risk",
    tier: "deep",
    system: P.riskSystemPrompt(args.contractType, args.jurisdiction, args.language),
    prompt: P.riskUserPrompt(args.index, args.title, args.text),
    schema: RiskAssessmentResult,
    cacheInput: `${args.contractType}|${args.text}`,
    mock: () => mockRiskAssessment(args.text, args.title),
    contractId: args.contractId,
  });
}

export async function summarizeDocument(args: {
  clauses: { title: string | null; text: string }[];
  assessments: RiskAssessmentResult[];
  contractType: ContractType;
  jurisdiction: string | null;
  contractId?: string;
}): Promise<DocSummaryResult> {
  return runObject({
    task: "docSummary",
    tier: "deep",
    system: P.docSummarySystemPrompt(args.contractType, args.jurisdiction),
    prompt: P.docSummaryUserPrompt(args.clauses),
    schema: DocSummaryResult,
    cacheInput: args.clauses.map((c) => c.text).join("|"),
    mock: () => mockDocSummary(args.clauses, args.assessments),
    contractId: args.contractId,
  });
}

export async function generateNegotiationReport(args: {
  clauses: { index: number; title: string | null; text: string }[];
  assessments: RiskAssessmentResult[];
  perspective: Perspective;
  contractType: ContractType;
  jurisdiction: string | null;
  contractId?: string;
}): Promise<NegotiationReportResult> {
  const pair = PERSPECTIVE_PAIRS[args.contractType];
  const counterparty =
    pair && pair[0] === args.perspective
      ? PERSPECTIVE_LABELS[pair[1]].en
      : pair && pair[1] === args.perspective
        ? PERSPECTIVE_LABELS[pair[0]].en
        : "counterparty";

  const risks = args.clauses.map((c, i) => ({
    index: c.index,
    riskScore: args.assessments[i]?.riskScore ?? 0,
    severity: args.assessments[i]?.severity ?? "safe",
  }));

  return runObject({
    task: "negotiation",
    tier: "deep",
    system: P.negotiationSystemPrompt(args.perspective, counterparty, args.contractType, args.jurisdiction),
    prompt: P.negotiationUserPrompt(args.clauses, risks),
    schema: NegotiationReportResult,
    cacheInput: `${args.perspective}|${args.clauses.map((c) => c.text).join("|")}`,
    mock: () => mockNegotiationReport(args.clauses, args.assessments, args.perspective),
    contractId: args.contractId,
  });
}

/** Document-aware legal assistant (Editor right panel): Q&A / edit / insert / review. */
export async function assistantReply(args: {
  document: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
  contractType: ContractType;
  jurisdiction: string | null;
  language: string;
  contractId?: string;
}): Promise<AssistantResponse> {
  // Keep the last 6 turns of context (Feature: chats remember up to 6 messages).
  const history = (args.history ?? []).slice(-6);
  const raw = await runObject({
    task: "assistant",
    tier: "deep",
    system: P.assistantSystemPrompt(args.contractType, args.jurisdiction, args.language),
    prompt: P.assistantUserPrompt(args.document, args.message, history),
    schema: AssistantResponseLlm,
    cacheInput: `${args.message}\u0000${args.document}`,
    mock: () => mockAssistant(args.document, args.message),
    contractId: args.contractId,
  });
  return AssistantResponse.parse(raw);
}

/** Check a contract against free-text organization policies (Feature: org policies). */
export async function checkPolicyCompliance(args: {
  document: string;
  policies: string;
  contractType: ContractType;
  jurisdiction: string | null;
  contractId?: string;
}): Promise<PolicyComplianceResult> {
  return runObject({
    task: "policy",
    tier: "deep",
    system: P.policySystemPrompt(args.contractType, args.jurisdiction),
    prompt: P.policyUserPrompt(args.document, args.policies),
    schema: PolicyComplianceResult,
    cacheInput: `${args.policies} ${args.document}`,
    mock: () => mockPolicyCompliance(args.document, args.policies),
    contractId: args.contractId,
  });
}

/** War-game counterparty turn. Returns the full reply text (route may chunk it). */
export async function wargameReply(args: {
  history: { role: "user" | "assistant"; content: string }[];
  perspective: Perspective;
  contractType: ContractType;
}): Promise<string> {
  const pair = PERSPECTIVE_PAIRS[args.contractType];
  const counterparty =
    pair && pair[0] === args.perspective
      ? PERSPECTIVE_LABELS[pair[1]].en
      : pair && pair[1] === args.perspective
        ? PERSPECTIVE_LABELS[pair[0]].en
        : "counterparty";

  const ai = await resolveAi();
  if (ai.mode === "mock") {
    const started = Date.now();
    const reply = mockWargameReply(args.history, args.perspective);
    await logCall(
      "wargame",
      ai.deep,
      estimateTokens(args.history.map((m) => m.content).join(" ")),
      estimateTokens(reply),
      Date.now() - started,
      true,
      undefined,
      ai.userId,
    );
    return reply;
  }

  const started = Date.now();
  const { getLanguageModel } = await import("@/lib/ai/client");
  const { generateText } = await import("ai");
  try {
    const result = await generateText({
      model: await getLanguageModel(ai, ai.deep),
      system: P.wargameSystemPrompt(args.perspective, counterparty),
      messages: args.history,
    });
    const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number } }).usage;
    await logCall("wargame", ai.deep, usage?.promptTokens ?? 0, usage?.completionTokens ?? 0, Date.now() - started, true, undefined, ai.userId);
    return result.text;
  } catch (err) {
    await logCall("wargame", ai.deep, 0, 0, Date.now() - started, false, undefined, ai.userId);
    throw err;
  }
}
