"use client";

import { useEffect, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { useTheme } from "next-themes";
import { computeLineStatus, lineStatusField, setLineStatus } from "@/components/editor/change-tracking";

export function MarkdownEditor({
  value,
  onChange,
  baseline,
  aiLines,
  highlight,
  onViewReady,
}: {
  value: string;
  onChange: (v: string) => void;
  baseline: string;
  aiLines?: Set<number>;
  highlight?: string | null;
  onViewReady?: (view: EditorView) => void;
}) {
  const { resolvedTheme } = useTheme();
  const viewRef = useRef<EditorView | null>(null);

  const status = useMemo(
    () => computeLineStatus(baseline, value, aiLines ?? new Set()),
    [baseline, value, aiLines],
  );

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setLineStatus.of(status) });
  }, [status]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !highlight) return;
    const idx = view.state.doc.toString().indexOf(highlight);
    if (idx >= 0) {
      view.dispatch({
        selection: { anchor: idx, head: idx + highlight.length },
        scrollIntoView: true,
      });
      view.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight]);

  const extensions = useMemo(() => [markdown(), EditorView.lineWrapping, lineStatusField], []);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={resolvedTheme === "light" ? "light" : "dark"}
      extensions={extensions}
      height="100%"
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        autocompletion: false,
        bracketMatching: false,
        history: true,
      }}
      onCreateEditor={(view) => {
        viewRef.current = view;
        onViewReady?.(view);
        view.dispatch({ effects: setLineStatus.of(status) });
      }}
      style={{ height: "100%" }}
    />
  );
}
