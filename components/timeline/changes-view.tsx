"use client";

import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  GitCommitHorizontal,
  Sparkles,
  Trash2,
  PenLine,
  CheckCircle2,
  Stamp,
  ScanLine,
  RotateCcw,
  Wand2,
  History,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/components/workspace/workspace-store";
import { restoreVersionAction } from "@/app/actions";
import { wordDiff, diffBadge } from "@/lib/diff/textDiff";
import { cn, toPersianDigits } from "@/lib/utils";
import type { DiffSegment } from "@/lib/diff/textDiff";
import type { LucideIcon } from "lucide-react";

const EVENT_ICON: Record<string, LucideIcon> = {
  created: GitCommitHorizontal,
  ai_added_clause: Sparkles,
  user_deleted_text: Trash2,
  user_edited: PenLine,
  ai_rewrote_section: PenLine,
  user_approved: CheckCircle2,
  contract_signed: Stamp,
  risk_scan_completed: ScanLine,
  restored: RotateCcw,
  negotiation_accepted: CheckCircle2,
  fix_applied: Wand2,
};

function sourceColor(source: string) {
  return source === "ai" ? "#d946ef" : source === "system" ? "#64748b" : "hsl(var(--primary))";
}

/** Render one side of a side-by-side redline (keep equal + the given change type). */
function SideText({ segments, keep }: { segments: DiffSegment[]; keep: "added" | "removed" }) {
  return (
    <div dir="rtl" className="whitespace-pre-wrap text-start text-[13px] leading-7">
      {segments
        .filter((s) => s.type === "equal" || s.type === keep)
        .map((s, i) =>
          s.type === "equal" ? (
            <span key={i} className="text-foreground/70">
              {s.value}
            </span>
          ) : (
            <span
              key={i}
              className={cn(
                "rounded px-0.5",
                keep === "added"
                  ? "bg-risk-safe/25 text-risk-safe"
                  : "bg-risk-critical/20 text-risk-critical line-through decoration-risk-critical/60",
              )}
            >
              {s.value}
            </span>
          ),
        )}
    </div>
  );
}

export function ChangesView() {
  const t = useTranslations("timeline");
  const { data, locale, selectedVersionId, selectVersion } = useWorkspace();
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Single-branch (main lane only): versions on the trunk, newest first.
  const versions = useMemo(
    () => [...data.timeline.versions].filter((v) => !v.branchId).sort((a, b) => b.versionNumber - a.versionNumber),
    [data.timeline.versions],
  );
  const current = data.version; // head
  const selected =
    versions.find((v) => v.id === selectedVersionId) ??
    versions.find((v) => v.id !== current?.id) ??
    versions[0] ??
    null;

  const events = useMemo(
    () => [...data.timeline.events].filter((e) => !e.branchId).reverse(),
    [data.timeline.events],
  );

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });

  const diff =
    selected && current && selected.id !== current.id ? wordDiff(selected.contentText, current.contentText) : null;

  const restore = (versionId: string) =>
    start(async () => {
      await restoreVersionAction(data.contract.id, versionId);
      toast.success("نسخه بازگردانی شد");
      router.refresh();
    });

  return (
    <div className="grid h-full grid-cols-1 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Sidebar: single-branch history */}
      <aside dir="rtl" className="order-2 overflow-y-auto scrollbar-thin border-e bg-card/20 p-3 text-start lg:order-1">
        <h3 className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
          <History className="size-4 text-primary" />
          {t("title")}
        </h3>
        <div>
          {events.map((e, i) => {
            const Icon = EVENT_ICON[e.type] ?? GitCommitHorizontal;
            const color = sourceColor(e.source);
            const isOpen = expanded === e.id;
            const isSelected = e.versionId && selected?.id === e.versionId;
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className="flex gap-2.5"
              >
                <div className="relative flex w-5 flex-col items-center">
                  {i !== 0 && <span className="absolute -top-2 h-3 w-px bg-border" />}
                  <span className="absolute top-3 h-full w-px bg-border" />
                  <span
                    className="relative z-10 mt-1 grid size-5 place-items-center rounded-full ring-4 ring-background"
                    style={{ background: `${color}22`, color }}
                  >
                    <Icon className="size-3" />
                  </span>
                </div>
                <button
                  onClick={() => {
                    setExpanded(isOpen ? null : e.id);
                    if (e.versionId) selectVersion(e.versionId);
                  }}
                  className={cn(
                    "mb-1 flex-1 rounded-lg border px-2.5 py-2 text-start transition-colors",
                    isSelected ? "border-primary/50 bg-primary/5" : "border-transparent hover:bg-muted",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium leading-snug">{e.summary}</p>
                    <Badge variant="outline" className="shrink-0 text-[9px]" style={{ color, borderColor: `${color}55` }}>
                      {t(e.source === "ai" ? "ai" : e.source === "system" ? "system" : "human")}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                    <span>{fmt(e.createdAt)}</span>
                    {e.diff && (e.diff.added > 0 || e.diff.removed > 0) && (
                      <Badge variant="muted" className="text-[9px] tabular-nums">
                        {diffBadge(e.diff)}
                      </Badge>
                    )}
                  </div>
                  {isOpen && e.why && <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">{e.why}</p>}
                  {isOpen && e.versionId && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        e.versionId && restore(e.versionId);
                      }}
                      className={cn(
                        "mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]",
                        pending ? "opacity-50" : "hover:bg-muted",
                      )}
                    >
                      <RotateCcw className="size-3" />
                      {t("restore")}
                    </span>
                  )}
                </button>
              </motion.div>
            );
          })}
          {events.length === 0 && <p className="px-1 text-sm text-muted-foreground">{t("noEvents")}</p>}
        </div>
      </aside>

      {/* Main: selected vs current, side by side with marked changes */}
      <main dir="rtl" className="order-1 overflow-y-auto scrollbar-thin p-5 text-start lg:order-2">
        <div className="mx-auto max-w-4xl">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4 text-primary" />
            مقایسهٔ نسخه‌ها
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {/* Selected version */}
            <div className="rounded-xl border bg-card/40 p-4">
              <div className="mb-2 flex items-center justify-between">
                <Badge variant="muted" className="gap-1">
                  نسخهٔ انتخاب‌شده · v{selected ? toPersianDigits(selected.versionNumber) : "—"}
                </Badge>
                {selected?.message && <span className="line-clamp-1 text-[10px] text-muted-foreground">{selected.message}</span>}
              </div>
              {diff ? (
                <SideText segments={diff.segments} keep="removed" />
              ) : (
                <p dir="rtl" className="whitespace-pre-wrap text-start text-[13px] leading-7 text-foreground/70">
                  {selected?.contentText ?? "—"}
                </p>
              )}
            </div>

            {/* Current version */}
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="mb-2 flex items-center justify-between">
                <Badge className="gap-1">
                  نسخهٔ فعلی · v{current ? toPersianDigits(current.versionNumber) : "—"}
                </Badge>
                {diff && (
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{diffBadge(diff)}</span>
                )}
              </div>
              {diff ? (
                <SideText segments={diff.segments} keep="added" />
              ) : (
                <p dir="rtl" className="whitespace-pre-wrap text-start text-[13px] leading-7 text-foreground/70">
                  {current?.contentText ?? "—"}
                </p>
              )}
            </div>
          </div>

          {!diff && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              یک تغییر را از تاریخچه انتخاب کنید تا تفاوت آن با نسخهٔ فعلی نمایش داده شود.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
