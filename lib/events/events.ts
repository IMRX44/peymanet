import { prisma } from "@/lib/db/prisma";
import { toJson } from "@/lib/db/json";
import type { EventType, AiSource } from "@/lib/ai/schemas";
import type { DiffSegment } from "@/lib/diff/textDiff";

export type RecordEventInput = {
  contractId: string;
  type: EventType;
  source: AiSource;
  summary: string;
  actorId?: string | null;
  why?: string | null;
  versionId?: string | null;
  branchId?: string | null;
  diff?: { segments: DiffSegment[]; added: number; removed: number } | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Append an event to the contract's timeline. This is the single integration
 * hub: heatmap "apply fix", negotiation "accept", edits, branches, signing —
 * everything flows through here, so the Timeline is also the audit log.
 */
export async function recordEvent(input: RecordEventInput) {
  return prisma.timelineEvent.create({
    data: {
      contractId: input.contractId,
      type: input.type,
      source: input.source,
      summary: input.summary,
      actorId: input.actorId ?? null,
      why: input.why ?? null,
      versionId: input.versionId ?? null,
      branchId: input.branchId ?? null,
      diffJson: input.diff ? toJson(input.diff) : null,
      metadataJson: input.metadata ? toJson(input.metadata) : null,
    },
  });
}
