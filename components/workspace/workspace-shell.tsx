"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Scale, ScanLine, Loader2, Eye, ChevronRight, ShieldAlert, GitBranch, Handshake } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle, LocaleToggle } from "@/components/shared/toggles";
import { ContractHeatmap } from "@/components/heatmap/contract-heatmap";
import { RiskDashboard } from "@/components/heatmap/risk-dashboard";
import { TimelinePanel } from "@/components/timeline/timeline-panel";
import { NegotiationCenter } from "@/components/negotiation/negotiation-center";
import { useWorkspace } from "@/components/workspace/workspace-store";
import { CONTRACT_TYPE_LABELS } from "@/lib/constants";
import { pickBilingual } from "@/lib/i18n/localize";
import { SEVERITY_HEX } from "@/lib/risk/colors";
import { toPersianDigits } from "@/lib/utils";
import type { ContractType } from "@/lib/ai/schemas";

export function WorkspaceShell() {
  const t = useTranslations("workspace");
  const tc = useTranslations("common");
  const { data, locale, activeTab, setActiveTab, analyzing, runAnalysis, showPatterns, togglePatterns, focusClause, liveScores } = useWorkspace();

  return (
    <div className="mesh-bg flex h-screen flex-col">
      {/* Top bar */}
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
            {data.version ? ` · v${locale === "fa" ? toPersianDigits(data.version.versionNumber) : data.version.versionNumber}` : ""}
          </p>
        </div>

        <div className="ms-auto flex items-center gap-1.5">
          {data.aiMode === "mock" && (
            <Badge variant="outline" className="hidden gap-1 text-[10px] text-muted-foreground md:inline-flex">
              <span className="size-1.5 rounded-full bg-risk-medium" />
              {tc("mockMode")}
            </Badge>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1">
                <Eye className="size-3.5 text-muted-foreground" />
                <Switch checked={showPatterns} onCheckedChange={togglePatterns} />
              </div>
            </TooltipTrigger>
            <TooltipContent>{tc("togglePatterns")}</TooltipContent>
          </Tooltip>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={runAnalysis} disabled={analyzing}>
            {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <ScanLine className="size-3.5" />}
            <span className="hidden sm:inline">{analyzing ? t("analyzing") : t("reanalyze")}</span>
          </Button>
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* 3-pane */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[232px_minmax(0,1fr)_clamp(380px,32vw,460px)]">
        {/* Left rail: clause nav */}
        <aside className="hidden overflow-y-auto scrollbar-thin border-e bg-card/30 p-3 lg:block">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("clausesCount")} · {locale === "fa" ? toPersianDigits(data.clauses.length) : data.clauses.length}
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

        {/* Center: heatmap */}
        <main className="overflow-hidden border-e">
          <ContractHeatmap />
        </main>

        {/* Right rail: tabs */}
        <aside className="overflow-y-auto scrollbar-thin bg-card/20">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex h-full flex-col">
            <div className="sticky top-0 z-10 border-b bg-card/80 p-2 backdrop-blur">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="risk" className="gap-1 text-xs">
                  <ShieldAlert className="size-3.5" />
                  {t("riskTab")}
                </TabsTrigger>
                <TabsTrigger value="timeline" className="gap-1 text-xs">
                  <GitBranch className="size-3.5" />
                  {t("timelineTab")}
                </TabsTrigger>
                <TabsTrigger value="negotiation" className="gap-1 text-xs">
                  <Handshake className="size-3.5" />
                  {t("negotiationTab")}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="risk" className="mt-0">
              <RiskDashboard />
            </TabsContent>
            <TabsContent value="timeline" className="mt-0">
              <TimelinePanel />
            </TabsContent>
            <TabsContent value="negotiation" className="mt-0">
              <NegotiationCenter />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {/* Disclaimer */}
      <footer className="shrink-0 border-t bg-card/50 px-4 py-1.5 text-center text-[11px] text-muted-foreground">
        {tc("disclaimer")}
      </footer>
    </div>
  );
}
