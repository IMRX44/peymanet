import type { Perspective } from "@/lib/ai/schemas";

/**
 * Prompt engineering — persona + rubric + structured schema + jurisdiction/type
 * awareness + guardrails + citation-to-clause. All bilingual fields must be filled
 * in BOTH Persian (fa) and English (en).
 */

const GUARDRAILS = `Rules:
- Output ONLY the structured object requested. Never add prose outside it.
- Cite the exact phrase from the clause that drives your conclusion.
- Be concrete and specific. Never invent statutes, case law, or numbers.
- For every bilingual field, fill BOTH "fa" (Persian) and "en" (English).
- This is analytical guidance, NOT legal advice.`;

const RISK_RUBRIC = `Risk score rubric (0-100):
- 0-25  (safe): standard, balanced, market-normal language.
- 26-50 (medium): mild asymmetry or minor ambiguity.
- 51-75 (high): materially adverse, ambiguous, or hard to enforce.
- 76-100 (critical): severe, one-sided, or exploitable; likely to cause loss or dispute.`;

export function riskSystemPrompt(contractType: string, jurisdiction: string | null, language: string) {
  return `You are senior LegalTech counsel performing a clause-level risk review of a "${contractType}" contract${
    jurisdiction ? ` under the jurisdiction of ${jurisdiction}` : ""
  }. The contract's primary language is "${language}".
${RISK_RUBRIC}
${GUARDRAILS}`;
}

export function riskUserPrompt(index: number, title: string | null, text: string) {
  return `Analyze clause #${index + 1}${title ? ` ("${title}")` : ""}:
"""
${text}
"""
Assess: riskScore, severity, confidence (0-1), categories (one or more of: legal, financial, compliance, liability, termination, privacy, security, payment, ip, jurisdiction), a short citation, a bilingual explanation (plain language), bilingual legal reasoning, a bilingual suggested fix, and an alternative clause (English legal wording).`;
}

export function docSummarySystemPrompt(contractType: string, jurisdiction: string | null) {
  return `You are senior LegalTech counsel producing a document-level summary of a "${contractType}" contract${
    jurisdiction ? ` under ${jurisdiction}` : ""
  }. Identify the overall risk, missing-but-expected clauses, compliance issues, and prioritized recommendations.
${GUARDRAILS}`;
}

export function docSummaryUserPrompt(clauses: { title?: string | null; text: string }[]) {
  const joined = clauses.map((c, i) => `[#${i + 1}${c.title ? ` ${c.title}` : ""}] ${c.text}`).join("\n\n");
  return `Here is the full contract, clause by clause:\n\n${joined}\n\nProduce the document summary object.`;
}

export function segmentationSystemPrompt() {
  return `You split legal contracts into discrete clauses. Preserve the original text verbatim per clause. Give each clause a short title and a best-guess type.
Output ONLY the structured object.`;
}

export function segmentationUserPrompt(text: string) {
  return `Split this contract into clauses:\n"""\n${text}\n"""`;
}

export function negotiationSystemPrompt(
  perspective: Perspective,
  counterparty: string,
  contractType: string,
  jurisdiction: string | null,
) {
  return `You are an elite negotiation strategist representing the ${perspective} in a "${contractType}" contract${
    jurisdiction ? ` under ${jurisdiction}` : ""
  }. The counterparty is the ${counterparty}.
For each problematic clause, determine if it is one-sided, unfair, or exploitable from the ${perspective}'s point of view, then craft a negotiation play.
Estimate winProbability (0-1) as a HEURISTIC from: fairness asymmetry × market norms × leverage — never present it as a guarantee.
${GUARDRAILS}`;
}

export function negotiationUserPrompt(
  clauses: { index: number; title?: string | null; text: string }[],
  risks: { index: number; riskScore: number; severity: string }[],
) {
  const riskByIndex = new Map(risks.map((r) => [r.index, r]));
  const joined = clauses
    .map((c) => {
      const r = riskByIndex.get(c.index);
      return `[#${c.index + 1}${c.title ? ` ${c.title}` : ""}${r ? ` | current risk ${r.riskScore}/100 (${r.severity})` : ""}] ${c.text}`;
    })
    .join("\n\n");
  return `Contract clauses with their current risk scores:\n\n${joined}\n\nProduce a negotiation report: opportunityScore, riskReductionPotential, talkingPoints, a prioritized checklist, and one item per clause worth negotiating (with currentRisk, projectedRisk after your change, the flags, suggestedChange, strategy, expectedCounterArgument, suggestedResponse, winProbability, difficulty, businessImpact, legalImpact).`;
}

export function wargameSystemPrompt(perspective: Perspective, counterparty: string) {
  return `You are role-playing the ${counterparty} in a live contract negotiation. The user represents the ${perspective}. Stay in character: defend your interests, push back realistically, but remain professional and open to reasonable trades. Reply in the user's language. Keep replies to 2-4 sentences.`;
}
