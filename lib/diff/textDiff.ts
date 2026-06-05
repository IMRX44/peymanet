import { diffWords, diffLines } from "diff";

export type DiffSegment = {
  type: "equal" | "added" | "removed";
  value: string;
};

export type DiffStats = {
  added: number;
  removed: number;
  segments: DiffSegment[];
};

/** Word-level redline diff between two texts. */
export function wordDiff(before: string, after: string): DiffStats {
  const parts = diffWords(before, after);
  const segments: DiffSegment[] = parts.map((p) => ({
    type: p.added ? "added" : p.removed ? "removed" : "equal",
    value: p.value,
  }));
  return {
    added: parts.filter((p) => p.added).reduce((n, p) => n + p.value.split(/\s+/).filter(Boolean).length, 0),
    removed: parts.filter((p) => p.removed).reduce((n, p) => n + p.value.split(/\s+/).filter(Boolean).length, 0),
    segments,
  };
}

/** Line-level diff (used for compact previews in the timeline). */
export function lineDiff(before: string, after: string): DiffSegment[] {
  return diffLines(before, after).map((p) => ({
    type: p.added ? "added" : p.removed ? "removed" : "equal",
    value: p.value,
  }));
}

/** A one-line summary like "+12 / −4" for event cards. */
export function diffBadge(stats: DiffStats): string {
  return `+${stats.added} / −${stats.removed}`;
}
