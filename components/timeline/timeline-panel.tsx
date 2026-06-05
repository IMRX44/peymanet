"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  GitBranch,
  GitMerge,
  GitCommitHorizontal,
  Sparkles,
  Trash2,
  PenLine,
  CheckCircle2,
  Stamp,
  ScanLine,
  RotateCcw,
  Wand2,
  GitCompare,
  History,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DiffViewer } from "@/components/timeline/diff-viewer";
import { useWorkspace } from "@/components/workspace/workspace-store";
import { createBranchAction, mergeBranchAction, restoreVersionAction } from "@/app/actions";
import { wordDiff, diffBadge } from "@/lib/diff/textDiff";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { pickBilingual } from "@/lib/i18n/localize";
import { cn, toPersianDigits } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const EVENT_ICON: Record<string, LucideIcon> = {
  created: GitCommitHorizontal,
  ai_added_clause: Sparkles,
  user_deleted_text: Trash2,
  ai_rewrote_section: PenLine,
  user_approved: CheckCircle2,
  contract_signed: Stamp,
  risk_scan_completed: ScanLine,
  branch_created: GitBranch,
  merged: GitMerge,
  restored: RotateCcw,
  negotiation_accepted: CheckCircle2,
  fix_applied: Wand2,
};

function sourceColor(source: string) {
  return source === "ai" ? "#d946ef" : source === "system" ? "#64748b" : "hsl(var(--primary))";
}

export function TimelinePanel() {
  const t = useTranslations("timeline");
  const { data, locale } = useWorkspace();
  const router = useRouter();
  const [view, setView] = useState<"graph" | "list">("graph");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const events = [...data.timeline.events].reverse(); // newest first
  const openBranches = data.timeline.branches.filter((b) => b.status === "open");

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" });

  const restore = (versionId: string) =>
    start(async () => {
      await restoreVersionAction(data.contract.id, versionId);
      toast.success(locale === "en" ? "Version restored" : "نسخه بازگردانی شد");
      router.refresh();
    });

  return (
    <div className="space-y-4 p-4">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="me-auto flex items-center gap-2 text-sm font-semibold">
          <History className="size-4 text-primary" />
          {t("title")}
        </h3>
        <div className="flex rounded-lg bg-muted p-0.5">
          {(["graph", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                view === v ? "bg-background shadow" : "text-muted-foreground",
              )}
            >
              {t(v === "graph" ? "graphView" : "listView")}
            </button>
          ))}
        </div>
        <CompareDialog />
        <CreateBranchButton />
      </div>

      {/* branches */}
      {data.timeline.branches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <GitCommitHorizontal className="size-3" /> main
          </Badge>
          {data.timeline.branches.map((b) => (
            <div key={b.id} className="flex items-center gap-1">
              <Badge variant="muted" className="gap-1" style={{ color: b.color ?? undefined }}>
                <GitBranch className="size-3" />
                {b.name}
              </Badge>
              {b.status === "open" ? (
                <MergeButton branchId={b.id} branchName={b.name} />
              ) : (
                <span className="text-[10px] text-muted-foreground">{t("mergedClean")}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <Separator />

      {/* events */}
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noEvents")}</p>
      ) : (
        <div>
          {events.map((e, i) => {
            const Icon = EVENT_ICON[e.type] ?? GitCommitHorizontal;
            const color = e.branchId ? data.timeline.branches.find((b) => b.id === e.branchId)?.color ?? sourceColor(e.source) : sourceColor(e.source);
            const isOpen = expanded === e.id;
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex gap-3"
              >
                {view === "graph" && (
                  <div className="relative flex w-6 flex-col items-center">
                    {i !== 0 && <span className="absolute -top-2 h-4 w-px bg-border" />}
                    <span className="absolute top-3 h-full w-px bg-border" />
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: i * 0.03 + 0.1, type: "spring", stiffness: 300 }}
                      className="relative z-10 mt-1 grid size-6 place-items-center rounded-full ring-4 ring-background"
                      style={{ background: `${color}22`, color }}
                    >
                      <Icon className="size-3.5" />
                    </motion.span>
                  </div>
                )}

                <div className={cn("flex-1 pb-4", view === "list" && "rounded-lg border bg-card p-3")}>
                  <button onClick={() => setExpanded(isOpen ? null : e.id)} className="block w-full text-start">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug">{e.summary}</p>
                      <Badge
                        variant="outline"
                        className="shrink-0 text-[9px]"
                        style={{ color, borderColor: `${color}55` }}
                      >
                        {t(e.source === "ai" ? "ai" : e.source === "system" ? "system" : "human")}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      {e.actorName && <span>{e.actorName}</span>}
                      <span>·</span>
                      <span>{fmt(e.createdAt)}</span>
                      {e.diff && (e.diff.added > 0 || e.diff.removed > 0) && (
                        <Badge variant="muted" className="text-[9px] tabular-nums">
                          {diffBadge(e.diff)}
                        </Badge>
                      )}
                    </div>
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-2 pt-2">
                          {e.why && (
                            <p className="text-xs leading-5 text-muted-foreground">
                              <span className="font-semibold">{t("why")}: </span>
                              {e.why}
                            </p>
                          )}
                          {e.diff && e.diff.segments.length > 0 && <DiffViewer segments={e.diff.segments} />}
                          {e.versionId && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={pending}
                              onClick={() => e.versionId && restore(e.versionId)}
                            >
                              <RotateCcw className="size-3.5" />
                              {t("restore")}
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <Separator />
      <VersionScrubber />
    </div>
  );
}

function CreateBranchButton() {
  const t = useTranslations("timeline");
  const tc = useTranslations("common");
  const { data, locale } = useWorkspace();
  const router = useRouter();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Plus className="size-3.5" />
          {t("createBranch")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createBranch")}</DialogTitle>
        </DialogHeader>
        <Input placeholder={t("branchName")} value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          disabled={pending || !name.trim()}
          onClick={() =>
            start(async () => {
              await createBranchAction(data.contract.id, name.trim());
              toast.success(locale === "en" ? "Branch created" : "شاخه ایجاد شد");
              setOpen(false);
              setName("");
              router.refresh();
            })
          }
        >
          {tc("apply")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function MergeButton({ branchId, branchName }: { branchId: string; branchName: string }) {
  const t = useTranslations("timeline");
  const { data, locale } = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [conflicts, setConflicts] = useState<{ index: number; ours: string; theirs: string }[] | null>(null);

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-1.5 text-[11px]"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await mergeBranchAction(data.contract.id, branchId);
            if (res.merged) {
              toast.success(locale === "en" ? `Merged "${branchName}"` : `شاخه «${branchName}» ادغام شد`);
              router.refresh();
            } else {
              setConflicts(res.conflicts ?? []);
            }
          })
        }
      >
        <GitMerge className="size-3" />
        {t("merge")}
      </Button>
      <Dialog open={!!conflicts} onOpenChange={(o) => !o && setConflicts(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-risk-high">{t("conflictsFound")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {conflicts?.map((c) => (
              <div key={c.index} className="rounded-lg border p-2 text-xs">
                <p className="mb-1 font-semibold text-primary">main</p>
                <p className="rounded bg-primary/10 p-1.5">{c.ours}</p>
                <p className="mb-1 mt-2 font-semibold text-risk-high">{branchName}</p>
                <p className="rounded bg-risk-high/10 p-1.5">{c.theirs}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CompareDialog() {
  const t = useTranslations("timeline");
  const { data } = useWorkspace();
  const versions = data.timeline.versions;
  const [a, setA] = useState(versions[0]?.id);
  const [b, setB] = useState(versions[versions.length - 1]?.id);

  const va = versions.find((v) => v.id === a);
  const vb = versions.find((v) => v.id === b);
  const diff = va && vb ? wordDiff(va.contentText, vb.contentText) : null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <GitCompare className="size-3.5" />
          {t("compare")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("compare")}</DialogTitle>
        </DialogHeader>
        {versions.length < 2 ? (
          <p className="text-sm text-muted-foreground">{t("selectTwo")}</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Select value={a} onValueChange={setA}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      v{v.versionNumber} {v.message ? `· ${v.message}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <GitCompare className="size-4 shrink-0 text-muted-foreground" />
              <Select value={b} onValueChange={setB}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      v{v.versionNumber} {v.message ? `· ${v.message}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {diff && (
              <div className="max-h-[50vh] overflow-y-auto scrollbar-thin">
                <DiffViewer segments={diff.segments} />
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VersionScrubber() {
  const t = useTranslations("timeline");
  const { data, locale } = useWorkspace();
  const versions = data.timeline.versions;
  const [idx, setIdx] = useState(versions.length - 1);
  if (versions.length === 0) return null;
  const v = versions[Math.min(idx, versions.length - 1)];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <GitCommitHorizontal className="size-3.5" />
          {t("scrub")}
        </span>
        <Badge variant="muted">v{locale === "fa" ? toPersianDigits(v.versionNumber) : v.versionNumber}</Badge>
      </div>
      <Slider
        min={0}
        max={versions.length - 1}
        step={1}
        value={[idx]}
        onValueChange={([n]) => setIdx(n)}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={v.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="max-h-40 overflow-y-auto scrollbar-thin whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-[11px] leading-6 text-muted-foreground"
        >
          {v.contentText.slice(0, 600)}
          {v.contentText.length > 600 ? "…" : ""}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
