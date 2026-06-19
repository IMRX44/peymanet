import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";

/**
 * Obsidian-style "live preview" for Markdown inside CodeMirror.
 *
 * Renders bold / italic / inline-code / headings / blockquotes *as you type* by
 * styling the text and hiding the syntax markers (** * ` #). The markers are
 * revealed again on the line the cursor sits on, so editing stays natural and
 * the source is never lost (this is decoration-only — the document is untouched).
 */

const strong = Decoration.mark({ class: "cm-md-strong" });
const emphasis = Decoration.mark({ class: "cm-md-em" });
const inlineCode = Decoration.mark({ class: "cm-md-code" });
const hidden = Decoration.replace({});

const headingMark = (level: number) => Decoration.line({ class: `cm-md-h cm-md-h${level}` });
const quoteLine = Decoration.line({ class: "cm-md-quote" });

type Inline = { re: RegExp; mark: typeof strong; markLen: number };

// Order matters: bold (**/__) before italic (*/_) so ** isn't eaten as two *.
const INLINE: Inline[] = [
  { re: /\*\*([^\s*][^*]*?)\*\*/g, mark: strong, markLen: 2 },
  { re: /__([^\s_][^_]*?)__/g, mark: strong, markLen: 2 },
  { re: /(?<!\*)\*([^\s*][^*]*?)\*(?!\*)/g, mark: emphasis, markLen: 1 },
  { re: /(?<!_)_([^\s_][^_]*?)_(?!_)/g, mark: emphasis, markLen: 1 },
  { re: /`([^`]+?)`/g, mark: inlineCode, markLen: 1 },
];

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const sel = view.state.selection.main;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;

      // Block-level: headings & blockquotes (line decorations).
      const h = /^(#{1,6})\s/.exec(text);
      const cursorOnLine = sel.from <= line.to && sel.to >= line.from;
      if (h) {
        builder.add(line.from, line.from, headingMark(h[1].length));
        if (!cursorOnLine) builder.add(line.from, line.from + h[1].length + 1, hidden);
      } else if (/^>\s?/.test(text)) {
        builder.add(line.from, line.from, quoteLine);
      }

      // Inline spans — collect, sort by position, emit in order.
      type Span = { from: number; to: number; deco: Decoration };
      const spans: Span[] = [];
      for (const { re, mark, markLen } of INLINE) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          const start = line.from + m.index;
          const end = start + m[0].length;
          const inSel = sel.from <= end && sel.to >= start;
          spans.push({ from: start, to: end, deco: mark });
          if (!inSel) {
            spans.push({ from: start, to: start + markLen, deco: hidden });
            spans.push({ from: end - markLen, to: end, deco: hidden });
          }
        }
      }
      // Avoid overlaps (e.g. a stray match inside another) — keep first-wins.
      spans.sort((a, b) => a.from - b.from || a.to - b.to || (a.deco === hidden ? -1 : 1));
      let lastEnd = -1;
      for (const s of spans) {
        if (s.from < lastEnd) continue;
        builder.add(s.from, s.to, s.deco);
        if (s.deco !== hidden) lastEnd = s.to;
      }

      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const liveMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Visual styling for the rendered spans. */
export const liveMarkdownTheme = EditorView.theme({
  ".cm-md-strong": { fontWeight: "700" },
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-code": {
    fontFamily: "ui-monospace, SFMono-Regular, monospace",
    fontSize: "0.9em",
    background: "hsl(var(--muted))",
    padding: "0.1em 0.35em",
    borderRadius: "5px",
  },
  ".cm-md-h": { fontWeight: "800", lineHeight: "1.5" },
  ".cm-md-h1": { fontSize: "1.55em" },
  ".cm-md-h2": { fontSize: "1.3em" },
  ".cm-md-h3": { fontSize: "1.12em" },
  ".cm-md-h4, .cm-md-h5, .cm-md-h6": { fontSize: "1em" },
  ".cm-md-quote": {
    borderInlineStart: "3px solid hsl(var(--primary))",
    paddingInlineStart: "0.75em",
    color: "hsl(var(--muted-foreground))",
    fontStyle: "italic",
  },
});
