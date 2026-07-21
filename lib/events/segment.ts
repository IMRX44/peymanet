import { prisma } from "@/lib/db/prisma";
import { mockSegmentation } from "@/lib/ai/mock";

/**
 * (Re)build the Clause rows for a version by segmenting its canonical text.
 * Every path that creates a new version (editor commit, restore, merge, initial
 * draft) must call this so the risk/analysis view and the SSE scan always have
 * clauses to work with. Idempotent: clears any existing clauses first.
 */
export async function segmentVersionClauses(versionId: string, contentText: string) {
  await prisma.clause.deleteMany({ where: { versionId } });
  const seg = mockSegmentation(contentText);
  let cursor = 0;
  for (const c of seg.clauses) {
    const idx = contentText.indexOf(c.text, cursor);
    const start = idx >= 0 ? idx : cursor;
    const end = start + c.text.length;
    cursor = end;
    await prisma.clause.create({
      data: {
        versionId,
        index: c.index,
        title: c.title ?? null,
        type: c.type ?? null,
        text: c.text,
        startOffset: start,
        endOffset: end,
      },
    });
  }
}
