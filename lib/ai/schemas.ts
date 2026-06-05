import { z } from "zod";

/**
 * Shared Zod schemas — the single source of truth.
 * The same objects are passed to the OpenAI `generateObject` call (guaranteeing
 * typed, parseable AI output) AND reused to validate API request/response bodies.
 */

// ───────────────────────────── Enumerations ─────────────────────────────

export const RISK_CATEGORIES = [
  "legal",
  "financial",
  "compliance",
  "liability",
  "termination",
  "privacy",
  "security",
  "payment",
  "ip",
  "jurisdiction",
] as const;
export const RiskCategory = z.enum(RISK_CATEGORIES);
export type RiskCategory = z.infer<typeof RiskCategory>;

export const SEVERITIES = ["safe", "medium", "high", "critical"] as const;
export const Severity = z.enum(SEVERITIES);
export type Severity = z.infer<typeof Severity>;

export const DIFFICULTIES = ["easy", "moderate", "hard"] as const;
export const Difficulty = z.enum(DIFFICULTIES);
export type Difficulty = z.infer<typeof Difficulty>;

export const IMPACTS = ["low", "medium", "high"] as const;
export const Impact = z.enum(IMPACTS);
export type Impact = z.infer<typeof Impact>;

export const PERSPECTIVES = [
  "employee",
  "employer",
  "buyer",
  "seller",
  "contractor",
  "client",
  "landlord",
  "tenant",
] as const;
export const Perspective = z.enum(PERSPECTIVES);
export type Perspective = z.infer<typeof Perspective>;

export const CONTRACT_TYPES = [
  "employment",
  "sale",
  "service",
  "nda",
  "lease",
  "loan",
  "partnership",
  "other",
] as const;
export const ContractType = z.enum(CONTRACT_TYPES);
export type ContractType = z.infer<typeof ContractType>;

export const EVENT_TYPES = [
  "created",
  "ai_added_clause",
  "user_deleted_text",
  "user_edited",
  "ai_rewrote_section",
  "ai_suggestion_rejected",
  "user_approved",
  "contract_signed",
  "risk_scan_completed",
  "branch_created",
  "merged",
  "restored",
  "negotiation_accepted",
  "fix_applied",
] as const;
export const EventType = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventType>;

export const AI_SOURCES = ["human", "ai", "system"] as const;
export const AiSource = z.enum(AI_SOURCES);
export type AiSource = z.infer<typeof AiSource>;

// ───────────────────────────── Bilingual text ───────────────────────────

/** Most generative fields come back bilingual so the UI can switch instantly. */
export const Bilingual = z.object({
  fa: z.string(),
  en: z.string(),
});
export type Bilingual = z.infer<typeof Bilingual>;

// ───────────────────────────── Segmentation ─────────────────────────────

export const SegmentedClause = z.object({
  index: z.number().int(),
  title: z.string().nullable(),
  type: z.string().nullable(),
  text: z.string(),
});
export const SegmentationResult = z.object({
  clauses: z.array(SegmentedClause),
});
export type SegmentationResult = z.infer<typeof SegmentationResult>;

// ───────────────────────────── Risk (Feature 1) ─────────────────────────

export const RiskAssessmentResult = z.object({
  riskScore: z.number().int().min(0).max(100),
  severity: Severity,
  confidence: z.number().min(0).max(1),
  categories: z.array(RiskCategory).min(1),
  citation: z.string().nullable(),
  explanation: Bilingual,
  reasoning: Bilingual,
  suggestedFix: Bilingual.nullable(),
  alternativeClause: z.string().nullable(),
});
export type RiskAssessmentResult = z.infer<typeof RiskAssessmentResult>;

export const MissingClauseResult = z.object({
  type: z.string(),
  importance: Severity,
  rationale: Bilingual,
  suggestedText: z.string().nullable(),
});

export const ComplianceIssueResult = z.object({
  framework: z.string(),
  severity: Severity,
  description: Bilingual,
  remediation: Bilingual.nullable(),
});

export const RecommendationResult = z.object({
  priority: Impact,
  title: Bilingual,
  description: Bilingual,
});

export const DocSummaryResult = z.object({
  overallRisk: z.number().int().min(0).max(100),
  headline: Bilingual,
  missingClauses: z.array(MissingClauseResult),
  complianceIssues: z.array(ComplianceIssueResult),
  recommendations: z.array(RecommendationResult),
});
export type DocSummaryResult = z.infer<typeof DocSummaryResult>;

// ───────────────────────────── Negotiation (Feature 3) ──────────────────

export const NegotiationItemResult = z.object({
  clauseIndex: z.number().int().nullable(),
  title: Bilingual,
  currentRisk: z.number().int().min(0).max(100),
  projectedRisk: z.number().int().min(0).max(100),
  oneSided: z.boolean(),
  unfair: z.boolean(),
  exploitable: z.boolean(),
  suggestedChange: Bilingual,
  strategy: Bilingual,
  expectedCounterArgument: Bilingual,
  suggestedResponse: Bilingual,
  winProbability: z.number().min(0).max(1),
  difficulty: Difficulty,
  businessImpact: Impact,
  legalImpact: Impact,
});
export type NegotiationItemResult = z.infer<typeof NegotiationItemResult>;

export const NegotiationReportResult = z.object({
  opportunityScore: z.number().int().min(0).max(100),
  riskReductionPotential: z.number().int().min(0).max(100),
  talkingPoints: z.array(Bilingual),
  checklist: z.array(z.object({ label: Bilingual, priority: z.number().int() })),
  items: z.array(NegotiationItemResult),
});
export type NegotiationReportResult = z.infer<typeof NegotiationReportResult>;

// ───────────────────────────── API request bodies ───────────────────────

export const AnalyzeRequest = z.object({
  versionId: z.string().optional(),
});

export const NegotiateRequest = z.object({
  perspective: Perspective,
  versionId: z.string().optional(),
});

export const WargameRequest = z.object({
  message: z.string().min(1),
});

// ───────────────────────────── Document AI Assistant (Editor) ────────────────

/**
 * One structured response from the document-aware legal assistant.
 * `kind` selects which optional payload is populated:
 *   answer  -> message (+ optional highlight phrase to locate in the doc)
 *   edit    -> edit { find, replacement } (a proposed in-place rewrite)
 *   insert  -> insert { afterHeading, clause } (a new clause to add)
 *   review  -> findings[] (risk review)
 */
export const AssistantEdit = z.object({
  find: z.string(),
  replacement: z.string(),
});
export const AssistantInsert = z.object({
  afterHeading: z.string().nullable(),
  clause: z.string(),
});
export const AssistantFinding = z.object({
  clause: z.string(),
  risk: Bilingual,
  remediation: Bilingual,
});

export const AssistantResponse = z.object({
  kind: z.enum(["answer", "edit", "insert", "review"]),
  message: Bilingual,
  highlight: z.string().nullable(),
  summary: Bilingual.nullable(),
  edit: AssistantEdit.nullable(),
  insert: AssistantInsert.nullable(),
  findings: z.array(AssistantFinding).nullable(),
});
export type AssistantResponse = z.infer<typeof AssistantResponse>;
