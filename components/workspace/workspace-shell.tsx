"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Scale, ScanLine, Loader2, ChevronRight, ShieldAlert, Handshake, Clock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/shared/toggles";
import { ContractTabBar } from "@/components/shared/contract-tabbar";
import { ContractHeatmap } from "@/components/heatmap/contract-heatmap";
import { RiskDashboard } from "@/components/heatmap/risk-dashboard";
import { ChangesView } from "@/components/timeline/changes-view";
import { NegotiationCenter } from "@/components/negotiation/negotiation-center";
import { useWorkspace } from "@/components/workspace/workspace-store";
import { CONTRACT_TYPE_LABELS } from "@/lib/constants";
import { pickBilingual } from "@/lib/i18n/localize";
import { SEVERITY_HEX } from "@/lib/risk/colors";
import { cn, toPersianDigits } from "@/lib/utils";
import type { ContractType } from "@/lib/ai/schemas";

function relativeFa(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "همین الان";
  if (min < 60) return `${toPersianDigits(min)} دقیقه پیش`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${toPersianDigits(hr)} ساعت پیش`;
  const day = Math.round(hr / 24);
  return `${toPersianDigits(day)} روز پیش`;
}

export function WorkspaceShell() {
  const t = useTranslations("workspace");
  const tc = useTranslations("common");
  const { data, locale, activeTab, setActiveTab, view, analyzing, runAnalysis, focusClause, liveScores } = useWorkspace();
  const analysis = data.analysis;

  return (
    <div className="mesh-bg flex h-screen flex-col">
      {/* Top bar — identical chrome across editor / risk / changes views */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card/50 px-4 backdrop-blur">
        <Link href="/contracts" className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Scale className="size-4" />
          </span>
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-bold">{data.contract.title}</h1>
            <Badge variant="muted" className="hidden shrink-0 text-[10px] sm:inline-flex">
              {pickBilingual(CONTRACT_TYPE_LABELS[data.contract.type as ContractType], locale)}
            </Badge>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {data.contract.jurisdiction} · {data.contract.status}
            {data.version ? ` · v${toPersianDigits(data.version.versionNumber)}` : ""}
          </p>
        </div>

        <div className="mx-auto">
          <ContractTabBar contractId={data.contract.id} active={view === "changes" ? "changes" : "risk"} />
        </div>

        <div className="flex items-center gap-1.5">
          {data.aiMode === "mock" && (
            <Badge variant="outline" className="hidden gap-1 text-[10px] text-muted-foreground lg:inline-flex">
              <span className="size-1.5 rounded-full bg-risk-medium" />
              {tc("mockMode")}
            </Badge>
          )}
          {/* Re-analyze + its metadata grouped together */}
          <div className="flex flex-col items-end">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={runAnalysis} disabled={analyzing}>
              {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <ScanLine className="size-3.5" />}
              <span className="hidden sm:inline">{analyzing ? t("analyzing") : t("reanalyze")}</span>
            </Button>
            {analysis?.analyzedAt && (
              <span className="mt-0.5 hidden items-center gap-1 text-[10px] text-muted-foreground md:flex">
                <Clock className="size-2.5" />
                {t("lastAnalyzed")}: {relativeFa(analysis.analyzedAt)}
                {analysis.changesSince > 0 && (
                  <span className="text-risk-medium">
                    · {toPersianDigits(analysis.changesSince)} {t("changesSince")}
                  </span>
                )}
              </span>
            )}
          </div>
          <ThemeToggle />
        </div>
      </header>

      {view === "changes" ? (
        <div className="flex-1 overflow-hidden">
          <ChangesView />
        </div>
      ) : (
        /* 3-pane analyze view (RTL: clause | heatmap | context) */
        <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[232px_minmax(0,1fr)_clamp(380px,32vw,460px)]">
          {/* Context rail: risk / negotiation */}
          <aside dir="rtl" lang={locale} className="order-2 overflow-y-auto scrollbar-thin border-e bg-card/20 text-start lg:order-3">
            <Tabs
              dir="rtl"
              lang={locale}
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as typeof activeTab)}
              className="flex h-full w-full flex-col"
            >
              <div className="sticky top-0 z-10 border-b bg-card/80 p-2 backdrop-blur">
                <TabsList dir="rtl" className="grid h-10 w-full grid-cols-2">
                  <TabsTrigger value="risk" className="gap-1 text-xs">
                    <ShieldAlert className="size-3.5" />
                    {t("riskTab")}
                  </TabsTrigger>
                  <TabsTrigger value="negotiation" className="gap-1 text-xs">
                    <Handshake className="size-3.5" />
                    {t("negotiationTab")}
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="risk" dir="rtl" lang={locale} className="mt-0 w-full text-start">
                <RiskDashboard />
              </TabsContent>
              <TabsContent value="negotiation" dir="rtl" lang={locale} className="mt-0 w-full text-start">
                <NegotiationCenter />
              </TabsContent>
            </Tabs>
          </aside>

          {/* Center: heatmap */}
          <main className="order-1 overflow-hidden border-e lg:order-2">
            <ContractHeatmap />
          </main>

          {/* Clause TOC */}
          <aside dir="rtl" lang={locale} className="order-3 hidden overflow-y-auto scrollbar-thin bg-card/30 p-3 text-start lg:order-1 lg:block">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("clausesCount")} · {toPersianDigits(data.clauses.length)}
            </p>
            <div className="space-y-0.5">
              {data.clauses.map((c) => {
                const sev = liveScores[c.id]?.severity ?? c.risk?.severity ?? null;
                return (
                  <button
                    key={c.id}
                    onClick={() => focusClause(c.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-xs transition-colors hover:bg-muted"
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ background: sev ? SEVERITY_HEX[sev] : "hsl(var(--muted-foreground))" }} />
                    <span className="line-clamp-1 flex-1 text-muted-foreground">{c.title}</span>
                    <ChevronRight className="size-3 text-muted-foreground/50 rtl:rotate-180" />
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      {/* Disclaimer */}
      <footer className="shrink-0 border-t bg-card/50 px-4 py-1.5 text-center text-[11px] text-muted-foreground">
        {tc("disclaimer")}
      </footer>
    </div>
  );
}
