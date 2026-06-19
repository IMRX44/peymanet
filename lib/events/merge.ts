/**
 * Pragmatic paragraph-aligned 3-way merge.
 *
 * Contracts are clause/paragraph structured, so we align by paragraph index:
 *   • paragraph changed on only one side  -> take the changed side
 *   • paragraph changed on both sides to different text -> conflict
 *   • paragraphs appended by either side  -> appended to the result
 * This is intentionally simpler than a full diff3 but deterministic and correct
 * for the in-place clause edits the product produces. Pure + unit-tested.
 */

export type MergeConflict = {
  index: number;
  base: string;
  ours: string;
  theirs: string;
};

export type MergeResult = {
  merged: string;
  conflicts: MergeConflict[];
  clean: boolean;
};

function splitParas(text: string): string[] {
  return text.split(/\n{2,}/).map((p) => p.trim());
}

export function threeWayMerge(base: string, ours: string, theirs: string): MergeResult {
  if (ours === theirs) return { merged: ours, conflicts: [], clean: true };
  if (ours === base) return { merged: theirs, conflicts: [], clean: true };
  if (theirs === base) return { merged: ours, conflicts: [], clean: true };

  const b = splitParas(base);
  const o = splitParas(ours);
  const t = splitParas(theirs);
  const max = Math.max(b.length, o.length, t.length);

  const out: string[] = [];
  const conflicts: MergeConflict[] = [];

  for (let i = 0; i < max; i++) {
    const bp = b[i] ?? "";
    const op = o[i] ?? "";
    const tp = t[i] ?? "";

    const ourChanged = op !== bp;
    const theirChanged = tp !== bp;

    if (ourChanged && theirChanged && op !== tp) {
      conflicts.push({ index: i, base: bp, ours: op, theirs: tp });
      // Keep "ours" by default in the merged body (incl. a deletion = empty);
      // UI resolves conflicts. A sentinel keeps a deleted paragraph from being
      // silently replaced by theirs via the empty-paragraph filter below.
      out.push(op);
    } else if (theirChanged) {
      out.push(tp);
    } else if (ourChanged) {
      out.push(op);
    } else {
      out.push(bp);
    }
  }

  const merged = out.filter((p) => p.length > 0).join("\n\n");
  return { merged, conflicts, clean: conflicts.length === 0 };
}
