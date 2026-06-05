import { diffLines } from "diff";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

/**
 * Line-level change tracking for the markdown editor.
 *   added (green) · modified (yellow) · removed-before (red marker) · ai (purple)
 * Status is computed in React (diff vs the committed baseline) and pushed into the
 * editor as a StateEffect; the StateField rebuilds line decorations from it.
 */
export type LineStatus = {
  added: Set<number>;
  modified: Set<number>;
  removedAt: Set<number>;
  ai: Set<number>;
};

export function emptyStatus(): LineStatus {
  return { added: new Set(), modified: new Set(), removedAt: new Set(), ai: new Set() };
}

export function computeLineStatus(baseline: string, current: string, ai: Set<number> = new Set()): LineStatus {
  const parts = diffLines(baseline, current);
  const added = new Set<number>();
  const modified = new Set<number>();
  const removedAt = new Set<number>();
  let line = 1; // 1-based line pointer into `current`
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const count = p.count ?? (p.value ? p.value.replace(/\n$/, "").split("\n").length : 0);
    if (p.added) {
      const prev = parts[i - 1];
      const isMod = !!(prev && prev.removed);
      for (let k = 0; k < count; k++) (isMod ? modified : added).add(line + k);
      line += count;
    } else if (p.removed) {
      const next = parts[i + 1];
      if (!(next && next.added)) removedAt.add(line);
      // removed text isn't present in `current`, so don't advance the pointer
    } else {
      line += count;
    }
  }
  return { added, modified, removedAt, ai };
}

export const setLineStatus = StateEffect.define<LineStatus>();

export const lineStatusField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setLineStatus)) {
        const s = e.value;
        const builder = new RangeSetBuilder<Decoration>();
        const total = tr.state.doc.lines;
        for (let n = 1; n <= total; n++) {
          const cls: string[] = [];
          if (s.removedAt.has(n)) cls.push("cm-line-removed-before");
          if (s.ai.has(n)) cls.push("cm-line-ai");
          else if (s.modified.has(n)) cls.push("cm-line-modified");
          else if (s.added.has(n)) cls.push("cm-line-added");
          if (cls.length) {
            const ln = tr.state.doc.line(n);
            builder.add(ln.from, ln.from, Decoration.line({ class: cls.join(" ") }));
          }
        }
        deco = builder.finish();
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});
