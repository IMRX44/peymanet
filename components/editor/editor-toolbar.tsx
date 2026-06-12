"use client";

import { Bold, Italic, Heading2, Heading3, List, Quote, Library } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Wrap the current selection with `mark` on both sides. */
function wrap(view: EditorView, mark: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to) || "متن";
  view.dispatch({
    changes: { from, to, insert: `${mark}${selected}${mark}` },
    selection: { anchor: from + mark.length, head: from + mark.length + selected.length },
  });
  view.focus();
}

/** Insert `prefix` at the start of the line containing the cursor. */
function prefixLine(view: EditorView, prefix: string) {
  const line = view.state.doc.lineAt(view.state.selection.main.from);
  view.dispatch({ changes: { from: line.from, to: line.from, insert: prefix } });
  view.focus();
}

export function EditorToolbar({
  getView,
  onOpenLibrary,
}: {
  getView: () => EditorView | null;
  onOpenLibrary: () => void;
}) {
  const act = (fn: (v: EditorView) => void) => () => {
    const v = getView();
    if (v) fn(v);
  };

  const tools: { icon: typeof Bold; label: string; run: () => void }[] = [
    { icon: Bold, label: "پررنگ", run: act((v) => wrap(v, "**")) },
    { icon: Italic, label: "مورب", run: act((v) => wrap(v, "*")) },
    { icon: Heading2, label: "عنوان بزرگ", run: act((v) => prefixLine(v, "## ")) },
    { icon: Heading3, label: "عنوان کوچک", run: act((v) => prefixLine(v, "### ")) },
    { icon: List, label: "فهرست", run: act((v) => prefixLine(v, "- ")) },
    { icon: Quote, label: "نقل‌قول", run: act((v) => prefixLine(v, "> ")) },
  ];

  return (
    <div className="flex items-center gap-0.5 border-b bg-card/40 px-2 py-1">
      {tools.map((tool) => (
        <Tooltip key={tool.label}>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="size-8" onClick={tool.run}>
              <tool.icon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{tool.label}</TooltipContent>
        </Tooltip>
      ))}
      <span className="mx-1 h-5 w-px bg-border" />
      <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={onOpenLibrary}>
        <Library className="size-4" />
        <span className="text-xs">کتابخانه</span>
      </Button>
    </div>
  );
}
