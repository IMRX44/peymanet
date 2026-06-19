import { prisma } from "@/lib/db/prisma";
import { recordEvent } from "@/lib/events/events";
import { commitEdit } from "@/lib/events/versions";
import { threeWayMerge } from "@/lib/events/merge";

const BRANCH_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b", "#8b5cf6", "#06b6d4"];

export async function createBranch(input: {
  contractId: string;
  name: string;
  baseVersionId: string;
  createdById?: string | null;
}) {
  const count = await prisma.branch.count({ where: { contractId: input.contractId } });
  const branch = await prisma.branch.create({
    data: {
      contractId: input.contractId,
      name: input.name,
      baseVersionId: input.baseVersionId,
      headVersionId: input.baseVersionId,
      color: BRANCH_COLORS[count % BRANCH_COLORS.length],
      createdById: input.createdById ?? null,
    },
  });

  await recordEvent({
    contractId: input.contractId,
    type: "branch_created",
    source: "human",
    actorId: input.createdById,
    summary: `Created branch "${input.name}"`,
    why: `Forked from version to explore changes in isolation.`,
    branchId: branch.id,
    versionId: input.baseVersionId,
    metadata: { branchName: input.name },
  });

  return branch;
}

/**
 * Merge a branch back into main using a 3-way merge against the common ancestor.
 * Returns conflicts (if any) for the UI to resolve; on a clean merge it commits a
 * new head version and a `merged` event.
 */
export async function mergeBranch(input: { contractId: string; branchId: string; authorId?: string | null }) {
  const [branch, contract] = await Promise.all([
    prisma.branch.findUnique({ where: { id: input.branchId } }),
    prisma.contract.findUnique({ where: { id: input.contractId } }),
  ]);
  if (!branch || !contract) throw new Error("Branch or contract not found");

  const [base, ours, theirs] = await Promise.all([
    branch.baseVersionId ? prisma.contractVersion.findUnique({ where: { id: branch.baseVersionId } }) : null,
    contract.headVersionId ? prisma.contractVersion.findUnique({ where: { id: contract.headVersionId } }) : null,
    branch.headVersionId ? prisma.contractVersion.findUnique({ where: { id: branch.headVersionId } }) : null,
  ]);
  if (!ours || !theirs) throw new Error("Missing versions to merge");

  const result = threeWayMerge(base?.contentText ?? ours.contentText, ours.contentText, theirs.contentText);

  if (!result.clean) {
    return { merged: false, conflicts: result.conflicts, branchName: branch.name };
  }

  const version = await commitEdit({
    contractId: input.contractId,
    parentVersionId: contract.headVersionId ?? ours.id,
    // Keep JSON consistent with the merged text (was theirs.contentJson — stale).
    newContentJson: JSON.stringify({ markdown: result.merged }),
    newContentText: result.merged,
    eventType: "merged",
    source: "human",
    summary: `Merged branch "${branch.name}"`,
    why: `Integrated changes from "${branch.name}" into the main line.`,
    authorId: input.authorId,
    metadata: { branchName: branch.name, branchId: branch.id },
  });

  await prisma.branch.update({ where: { id: branch.id }, data: { status: "merged" } });

  return { merged: true, conflicts: [], version, branchName: branch.name };
}
