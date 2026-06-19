import { prisma } from "@/lib/db/prisma";
import { analyzeClauseRisk, summarizeDocument } from "@/lib/ai/providers";
import { recordEvent } from "@/lib/events/events";
import { resolveAi } from "@/lib/ai/resolve";
import { getCurrentUser } from "@/lib/auth";
import type { ContractType } from "@/lib/ai/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Server-Sent Events: re-run risk analysis over the head version's clauses,
 * streaming each clause result as it lands so the heatmap fills progressively.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Require an authenticated user who owns this contract.
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract?.headVersionId) {
    return new Response("contract or head version not found", { status: 404 });
  }
  if (contract.ownerId && contract.ownerId !== user.id) {
    return new Response("forbidden", { status: 403 });
  }
  const versionId = contract.headVersionId;
  const clauses = await prisma.clause.findMany({ where: { versionId }, orderBy: { index: "asc" } });
  if (clauses.length === 0) {
    return new Response("no clauses to analyze", { status: 400 });
  }
  const ai = await resolveAi();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      let runId: string | null = null;
      try {
        const run = await prisma.analysisRun.create({
          data: {
            contractId: id,
            versionId,
            status: "running",
            model: ai.mode === "mock" ? "mock" : ai.deep,
            startedAt: new Date(),
          },
        });
        runId = run.id;
        send("start", { runId: run.id, total: clauses.length });

        const assessments = [];
        for (let i = 0; i < clauses.length; i++) {
          const c = clauses[i];
          if (ai.mode === "mock") await sleep(280); // make the progressive fill visible
          const result = await analyzeClauseRisk({
            index: c.index,
            title: c.title,
            text: c.text,
            contractType: contract.type as ContractType,
            jurisdiction: contract.jurisdiction,
            language: contract.language,
            contractId: id,
          });
          await prisma.riskAssessment.create({
            data: {
              runId: run.id,
              clauseId: c.id,
              riskScore: result.riskScore,
              severity: result.severity,
              confidence: result.confidence,
              categoriesJson: JSON.stringify(result.categories),
              citation: result.citation,
              explanation: JSON.stringify(result.explanation),
              reasoning: JSON.stringify(result.reasoning),
              suggestedFix: result.suggestedFix ? JSON.stringify(result.suggestedFix) : null,
              alternativeClause: result.alternativeClause,
            },
          });
          assessments.push(result);
          send("clause", {
            clauseId: c.id,
            index: c.index,
            score: result.riskScore,
            severity: result.severity,
            confidence: result.confidence,
            current: i + 1,
            total: clauses.length,
          });
        }

        const summary = await summarizeDocument({
          clauses: clauses.map((c) => ({ title: c.title, text: c.text })),
          assessments,
          contractType: contract.type as ContractType,
          jurisdiction: contract.jurisdiction,
          contractId: id,
        });
        await prisma.analysisRun.update({
          where: { id: run.id },
          data: { status: "completed", overallRisk: summary.overallRisk, summaryJson: JSON.stringify(summary), completedAt: new Date() },
        });
        await recordEvent({
          contractId: id,
          type: "risk_scan_completed",
          source: "ai",
          summary: `اسکن مجدد ریسک — ریسک کلی ${summary.overallRisk}/100`,
          why: "تحلیل دوباره‌ی تمام بندها.",
          versionId,
          metadata: { overallRisk: summary.overallRisk },
        });

        send("done", { runId: run.id, overallRisk: summary.overallRisk });
        controller.close();
      } catch (err) {
        // Don't leave the run stuck in "running": mark it failed.
        if (runId) {
          await prisma.analysisRun
            .update({
              where: { id: runId },
              data: { status: "failed", error: err instanceof Error ? err.message : "analysis failed", completedAt: new Date() },
            })
            .catch(() => {});
        }
        send("error", { message: err instanceof Error ? err.message : "analysis failed" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
