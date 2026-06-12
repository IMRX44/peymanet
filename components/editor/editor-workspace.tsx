"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { undo, redo } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { Scale, Save, Undo2, Redo2, Check, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/shared/toggles";
import { ContractTabBar } from "@/components/shared/contract-tabbar";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { DocumentAssistant } from "@/components/editor/document-assistant";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { LibraryDialog } from "@/components/editor/library-dialog";
import { BlocksOutline } from "@/components/editor/blocks-outline";
import { autosaveDocumentAction, commitDocumentAction } from "@/app/actions";
import { cn, toPersianDigits } from "@/lib/utils";

function lineRange(text: string, sub: string): Set<number> {
  const idx = text.indexOf(sub);
  if (idx < 0) return new Set();
  const startLine = text.slice(0, idx).split("\n").length;
  const count = sub.replace(/^\n+|\n+$/g, "").split("\n").length;
  const set = new Set<number>();
  for (let i = 0; i < count; i++) set.add(startLine + i);
  return set;
}

export function EditorWorkspace({
  contractId,
  initialContent,
  versionNumber,
  title,
  locale,
}: {
  contractId: string;
  initialContent: string;
  versionNumber: number;
  title: string;
  locale: string;
}) {
  const t = useTranslations("editor");
  const [content, setContent] = useState(initialContent);
  const [baseline, setBaseline] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [aiLines, setAiLines] = useState<Set<number>>(new Set());
  const [highlight, setHighlight] = useState<string | null>(null);
  const [mode, setMode] = useState<"suggest" | "auto">("suggest");
  const [saving, setSaving] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const viewRef = useRef<EditorView | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty = content !== savedContent;

  // Autosave (debounced 2s) — persists the working draft in place.
  useEffect(() => {
    if (content === savedContent) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setSaving(true);
      await autosaveDocumentAction(contractId, content);
      setSavedContent(content);
      setSaving(false);
    }, 2000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [content, savedContent, contractId]);

  const saveVersion = useCallback(async () => {
    setSaving(true);
    await commitDocumentAction({
      contractId,
      content,
      source: "human",
      eventType: "user_edited",
      summary: "ذخیره‌ی نسخه‌ی جدید سند",
    });
    setSavedContent(content);
    setBaseline(content);
    setAiLines(new Set());
    setSaving(false);
    toast.success("نسخه ذخیره شد");
  }, [content, contractId]);

  const applyEdit = useCallback(
    (find: string, replacement: string, summary: string) => {
      if (!content.includes(find)) {
        toast.error("متن هدف در سند پیدا نشد");
        return;
      }
      const next = content.replace(find, replacement);
      setContent(next);
      setAiLines(lineRange(next, replacement));
      setSavedContent(next);
      setBaseline(next);
      void commitDocumentAction({ contractId, content: next, source: "ai", eventType: "ai_rewrote_section", summary }).then((res) => {
        if (!res.ok) toast.error(res.error ?? "ذخیره‌ی ویرایش هوش مصنوعی ناموفق بود");
      });
      toast.success("ویرایش هوش مصنوعی اعمال شد");
    },
    [content, contractId],
  );

  const applyInsert = useCallback(
    (clause: string, summary: string) => {
      const next = content.endsWith("\n") ? content + clause.trimStart() : content + clause;
      setContent(next);
      setAiLines(lineRange(next, clause.trim()));
      setSavedContent(next);
      setBaseline(next);
      void commitDocumentAction({ contractId, content: next, source: "ai", eventType: "ai_added_clause", summary }).then((res) => {
        if (!res.ok) toast.error(res.error ?? "ذخیره‌ی بند جدید ناموفق بود");
      });
      toast.success("بند جدید درج شد");
    },
    [content, contractId],
  );

  // Library: insert a ready-made clause (autosave persists it).
  const insertLibraryClause = useCallback(
    (body: string) => {
      const next = (content.trimEnd() + "\n\n" + body.trim()).trim();
      setContent(next);
      setAiLines(lineRange(next, body.trim()));
      setHighlight(body.split("\n")[0] ?? null);
      toast.success("بند از کتابخانه درج شد");
    },
    [content],
  );

  // Library: replace the whole document with a default template.
  const loadTemplate = useCallback((tplContent: string) => {
    setContent(tplContent);
    setBaseline(tplContent);
    setAiLines(new Set());
    toast.success("قرارداد پیش‌فرض بارگذاری شد — برای ثبت، نسخه را ذخیره کنید");
  }, []);

  const legend = [
    { cls: "bg-risk-safe", label: t("legendAdded") },
    { cls: "bg-risk-medium", label: t("legendModified") },
    { cls: "bg-risk-critical", label: t("legendDeleted") },
    { cls: "bg-[hsl(270_85%_65%)]", label: t("legendAi") },
  ];

  const SaveStatus = () =>
    dirty ? (
      <span className="flex items-center gap-1 text-[11px] text-risk-medium">
        <span className="size-1.5 rounded-full bg-risk-medium" />
        {t("unsaved")}
      </span>
    ) : saving ? (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        {t("saving")}
      </span>
    ) : (
      <span className="flex items-center gap-1 text-[11px] text-risk-safe">
        <Check className="size-3" />
        {t("saved")}
      </span>
    );

  return (
    <div className="mesh-bg flex h-screen flex-col">
      {/* Top bar — same chrome as the risk/changes views */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card/50 px-4 backdrop-blur">
        <Link href={`/contracts/${contractId}`} className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Scale className="size-4" />
          </span>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold">{title}</h1>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <PenLine className="size-3" />
            {t("editorMode")} · v{toPersianDigits(versionNumber)}
          </p>
        </div>

        <div className="mx-auto">
          <ContractTabBar contractId={contractId} active="editor" />
        </div>

        <div className="flex items-center gap-1.5">
          {/* mode toggle */}
          <div className="flex items-center rounded-lg bg-muted p-0.5">
            {(["suggest", "auto"] as const).map((md) => (
              <button
                key={md}
                onClick={() => setMode(md)}
                className={cn(
                  "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  mode === md ? "bg-background shadow" : "text-muted-foreground",
                )}
              >
                {t(md === "suggest" ? "modeSuggest" : "modeAuto")}
              </button>
            ))}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={() => viewRef.current && undo(viewRef.current)}>
                <Undo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("undo")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={() => viewRef.current && redo(viewRef.current)}>
                <Redo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("redo")}</TooltipContent>
          </Tooltip>

          {/* save status sits next to the save button */}
          <div className="flex items-center gap-2 rounded-lg border bg-card/60 px-2 py-1">
            <SaveStatus />
            <Button size="sm" className="h-7 gap-1.5" onClick={saveVersion} disabled={saving || !dirty}>
              <Save className="size-3.5" />
              <span className="hidden sm:inline">{t("saveVersion")}</span>
            </Button>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* 3-pane — assistant (chat) · editor · blocks outline */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[clamp(320px,27vw,400px)_minmax(0,1fr)_clamp(190px,16vw,240px)]">
        {/* Assistant (default/primary chat) */}
        <aside className="order-3 overflow-hidden border-e bg-card/20 lg:order-1">
          <DocumentAssistant
            contractId={contractId}
            locale={locale}
            document={content}
            mode={mode}
            onApplyEdit={applyEdit}
            onApplyInsert={applyInsert}
            onHighlight={setHighlight}
          />
        </aside>

        {/* Editor */}
        <main className="order-1 flex flex-col overflow-hidden lg:order-2">
          <EditorToolbar getView={() => viewRef.current} onOpenLibrary={() => setLibraryOpen(true)} />
          <div className="flex items-center gap-3 border-b bg-card/30 px-4 py-1.5 text-[10px] text-muted-foreground">
            {legend.map((l) => (
              <span key={l.label} className="flex items-center gap-1">
                <span className={cn("size-2 rounded-sm", l.cls)} />
                {l.label}
              </span>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              baseline={baseline}
              aiLines={aiLines}
              highlight={highlight}
              onViewReady={(v) => (viewRef.current = v)}
            />
          </div>
        </main>

        {/* Blocks outline (each clause = a movable / deletable block) */}
        <aside className="order-2 hidden overflow-hidden border-e bg-card/30 lg:order-3 lg:block">
          <BlocksOutline content={content} onChange={setContent} onFocusBlock={(line) => setHighlight(line)} />
        </aside>
      </div>

      <LibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onInsertClause={insertLibraryClause}
        onLoadTemplate={loadTemplate}
      />

      <footer className="shrink-0 border-t bg-card/50 px-4 py-1.5 text-center text-[11px] text-muted-foreground">
        {t("disclaimer")}
      </footer>
    </div>
  );
}
