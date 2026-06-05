import { prisma } from "@/lib/db/prisma";
import { contentHash } from "@/lib/utils";
import { recordEvent } from "@/lib/events/events";
import { wordDiff } from "@/lib/diff/textDiff";
import type { AiSource, EventType } from "@/lib/ai/schemas";

export type CreateVersionInput = {
  contractId: string;
  contentJson: string;
  contentText: string;
  parentVersionId?: string | null;
  branchId?: string | null;
  authorId?: string | null;
  source: AiSource;
  message?: string | null;
  /** When true, updates Contract.headVersion to this new version. */
  advanceHead?: boolean;
};

/** Create an immutable version snapshot (a DAG node). */
export async function createVersion(input: CreateVersionInput) {
  const agg = await prisma.contractVersion.aggregate({
    where: { contractId: input.contractId },
    _max: { versionNumber: true },
  });
  const versionNumber = (agg._max.versionNumber ?? 0) + 1;

  const version = await prisma.contractVersion.create({
    data: {
      contractId: input.contractId,
      versionNumber,
      parentId: input.parentVersionId ?? null,
      branchId: input.branchId ?? null,
      contentJson: input.contentJson,
      contentText: input.contentText,
      contentHash: contentHash(input.contentText),
      authorId: input.authorId ?? null,
      source: input.source,
      message: input.message ?? null,
    },
  });

  if (input.advanceHead !== false && !input.branchId) {
    await prisma.contract.update({
      where: { id: input.contractId },
      data: { headVersionId: version.id },
    });
  }
  if (input.branchId) {
    await prisma.branch.update({
      where: { id: input.branchId },
      data: { headVersionId: version.id },
    });
  }

  return version;
}

/**
 * Apply an edit: snapshot a new version on top of the current parent, compute the
 * redline diff, and record a timeline event in one transaction-like flow.
 */
export async function commitEdit(input: {
  contractId: string;
  parentVersionId: string;
  newContentJson: string;
  newContentText: string;
  eventType: EventType;
  source: AiSource;
  summary: string;
  why?: string | null;
  authorId?: string | null;
  branchId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const parent = await prisma.contractVersion.findUnique({ where: { id: input.parentVersionId } });
  const diff = parent ? wordDiff(parent.contentText, input.newContentText) : { segments: [], added: 0, removed: 0 };

  const version = await createVersion({
    contractId: input.contractId,
    contentJson: input.newContentJson,
    contentText: input.newContentText,
    parentVersionId: input.parentVersionId,
    branchId: input.branchId ?? null,
    authorId: input.authorId,
    source: input.source,
    message: input.summary,
  });

  await recordEvent({
    contractId: input.contractId,
    type: input.eventType,
    source: input.source,
    actorId: input.authorId,
    summary: input.summary,
    why: input.why,
    versionId: version.id,
    branchId: input.branchId ?? null,
    diff,
    metadata: input.metadata,
  });

  return version;
}

/** Non-destructive restore: snapshots the old content as a brand-new head version. */
export async function restoreVersion(input: {
  contractId: string;
  targetVersionId: string;
  authorId?: string | null;
}) {
  const [target, contract] = await Promise.all([
    prisma.contractVersion.findUnique({ where: { id: input.targetVersionId } }),
    prisma.contract.findUnique({ where: { id: input.contractId } }),
  ]);
  if (!target) throw new Error("Target version not found");

  return commitEdit({
    contractId: input.contractId,
    parentVersionId: contract?.headVersionId ?? input.targetVersionId,
    newContentJson: target.contentJson,
    newContentText: target.contentText,
    eventType: "restored",
    source: "human",
    summary: `Restored to v${target.versionNumber}`,
    why: `Reverted document state to version ${target.versionNumber}.`,
    authorId: input.authorId,
    metadata: { restoredFrom: target.versionNumber },
  });
}
