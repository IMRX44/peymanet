"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { WorkspaceData } from "@/lib/db/queries";
import type { Severity } from "@/lib/ai/schemas";

type LiveScore = { score: number; severity: Severity };
type Tab = "risk" | "negotiation";
type View = "analyze" | "changes";

type WorkspaceCtx = {
  data: WorkspaceData;
  locale: string;
  selectedClauseId: string | null;
  select: (id: string | null) => void;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  view: View;
  selectedVersionId: string | null;
  selectVersion: (id: string | null) => void;
  focusClause: (clauseId: string) => void;
  liveScores: Record<string, LiveScore>;
  analyzing: boolean;
  progress: { current: number; total: number } | null;
  runAnalysis: () => void;
};

const Ctx = createContext<WorkspaceCtx | null>(null);

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export function WorkspaceProvider({
  data,
  view = "analyze",
  children,
}: {
  data: WorkspaceData;
  view?: View;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [selectedClauseId, setSelected] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("risk");
  const [selectedVersionId, selectVersion] = useState<string | null>(null);
  const [liveScores, setLiveScores] = useState<Record<string, LiveScore>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const focusClause = useCallback((clauseId: string) => {
    setActiveTab("risk");
    setSelected(clauseId);
    const el = document.getElementById(`clause-${clauseId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("ring-2", "ring-primary");
    setTimeout(() => el?.classList.remove("ring-2", "ring-primary"), 1600);
  }, []);

  const runAnalysis = useCallback(() => {
    if (analyzing) return;
    setAnalyzing(true);
    setLiveScores({});
    setProgress({ current: 0, total: data.clauses.length });
    let finished = false;
    const es = new EventSource(`/api/contracts/${data.contract.id}/analyze`);
    es.addEventListener("clause", (e) => {
      const d = JSON.parse((e as MessageEvent).data);
      setLiveScores((prev) => ({ ...prev, [d.clauseId]: { score: d.score, severity: d.severity } }));
      setProgress({ current: d.current, total: d.total });
    });
    es.addEventListener("done", () => {
      finished = true;
      es.close();
      setAnalyzing(false);
      setProgress(null);
      toast.success(data.locale === "en" ? "Risk scan complete" : "اسکن ریسک کامل شد");
      router.refresh();
    });
    es.onerror = () => {
      // EventSource fires `error` on normal close — ignore that path.
      if (finished || es.readyState === EventSource.CLOSED) return;
      es.close();
      setAnalyzing(false);
      setProgress(null);
      toast.error(data.locale === "en" ? "Risk scan failed" : "اسکن ریسک ناموفق بود");
    };
  }, [analyzing, data.clauses.length, data.contract.id, data.locale, router]);

  const value = useMemo<WorkspaceCtx>(
    () => ({
      data,
      locale: data.locale,
      selectedClauseId,
      select: setSelected,
      activeTab,
      setActiveTab,
      view,
      selectedVersionId,
      selectVersion,
      focusClause,
      liveScores,
      analyzing,
      progress,
      runAnalysis,
    }),
    [data, selectedClauseId, activeTab, view, selectedVersionId, focusClause, liveScores, analyzing, progress, runAnalysis],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
