import { z } from "zod";
import { aiMode, MODELS, estimateCost } from "@/lib/ai/models";
import { cacheKey, getCached, setCached } from "@/lib/ai/cache";
import { prisma } from "@/lib/db/prisma";
import {
  SegmentationResult,
  RiskAssessmentResult,
  DocSummaryResult,
  NegotiationReportResult,
  type Perspective,
} from "@/lib/ai/schemas";
import {
  mockSegmentation,
  mockRiskAssessment,
  mockDocSummary,
  mockNegotiationReport,
  mockWargameReply,
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
) {
  try {
    await prisma.aiCall.create({
      data: {
        contractId,
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

/**
 * Core helper: run a structured-output task with caching + logging, switching
 * between deterministic mock and live OpenAI based on AI_MODE.
 */
async function runObject<T>(opts: {
  task: string;
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  cacheInput: string;
  mock: () => T;
  contractId?: string;
}): Promise<T> {
  const key = cacheKey(opts.task, opts.model, opts.cacheInput);
  const cached = await getCached<T>(key);
  if (cached) return cached;

  let value: T;
  if (aiMode() === "mock") {
    value = opts.mock();
  } else {
    const started = Date.now();
    // Lazy import so the OpenAI SDK is only loaded in live mode.
    const { openai } = await import("@ai-sdk/openai");
    const { generateObject } = await import("ai");
    try {
      const result = await generateObject({
        model: openai(opts.model),
        schema: opts.schema as z.ZodType<T>,
        system: opts.system,
        prompt: opts.prompt,
      });
      const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number } }).usage;
      await logCall(
        opts.task,
        opts.model,
        usage?.promptTokens ?? 0,
        usage?.completionTokens ?? 0,
        Date.now() - started,
        true,
        opts.contractId,
      );
      value = result.object as T;
    } catch (err) {
      await logCall(opts.task, opts.model, 0, 0, Date.now() - started, false, opts.contractId);
      throw err;
    }
  }

  await setCached(key, opts.task, opts.model, value);
  return value;
}

// ───────────────────────────── Public API ─────────────────────────────

export async function segmentContract(text: string): Promise<SegmentationResult> {
  return runObject({
    task: "segment",
    model: MODELS.fast,
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
    model: MODELS.deep,
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
    model: MODELS.deep,
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
    model: MODELS.deep,
    system: P.negotiationSystemPrompt(args.perspective, counterparty, args.contractType, args.jurisdiction),
    prompt: P.negotiationUserPrompt(args.clauses, risks),
    schema: NegotiationReportResult,
    cacheInput: `${args.perspective}|${args.clauses.map((c) => c.text).join("|")}`,
    mock: () => mockNegotiationReport(args.clauses, args.assessments, args.perspective),
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

  if (aiMode() === "mock") {
    return mockWargameReply(args.history, args.perspective);
  }

  const started = Date.now();
  const { openai } = await import("@ai-sdk/openai");
  const { generateText } = await import("ai");
  try {
    const result = await generateText({
      model: openai(MODELS.deep),
      system: P.wargameSystemPrompt(args.perspective, counterparty),
      messages: args.history,
    });
    const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number } }).usage;
    await logCall("wargame", MODELS.deep, usage?.promptTokens ?? 0, usage?.completionTokens ?? 0, Date.now() - started, true);
    return result.text;
  } catch (err) {
    await logCall("wargame", MODELS.deep, 0, 0, Date.now() - started, false);
    throw err;
  }
}
