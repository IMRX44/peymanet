"use client";

import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Handshake, Sparkles, TrendingDown, ListChecks, Megaphone, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScoreRing } from "@/components/shared/score-ring";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { NegotiationItemCard } from "@/components/negotiation/negotiation-item-card";
import { Wargame } from "@/components/negotiation/wargame";
import { useWorkspace } from "@/components/workspace/workspace-store";
import { generateNegotiationAction, toggleChecklistAction } from "@/app/actions";
import { simulateRiskReduction } from "@/lib/negotiation/simulate";
import { PERSPECTIVE_LABELS, PERSPECTIVE_PAIRS } from "@/lib/constants";
import { pickBilingual } from "@/lib/i18n/localize";
import { SEVERITY_HEX, scoreToSeverity } from "@/lib/risk/colors";
import { toPersianDigits } from "@/lib/utils";
import { PERSPECTIVES, type Perspective, type ContractType } from "@/lib/ai/schemas";

export function NegotiationCenter() {
  const t = useTranslations("negotiation");
  const { data, locale } = useWorkspace();
  const router = useRouter();
  const report = data.negotiation;

  const pair = PERSPECTIVE_PAIRS[data.contract.type as ContractType];
  const options: Perspective[] = pair ? [...pair] : [...PERSPECTIVES];

  const [perspective, setPerspective] = useState<Perspective>(report?.perspective ?? options[0]);
  const [generating, startGen] = useTransition();

  const generate = () =>
    startGen(async () => {
      try {
        const res = await generateNegotiationAction(data.contract.id, perspective);
        if (!res.ok) {
          toast.error(
            res.error ?? (locale === "en" ? "Negotiation report failed" : "گزارش مذاکره ناموفق بود"),
          );
          return;
        }
        toast.success(locale === "en" ? "Negotiation report ready" : "گزارش مذاکره آماده شد");
        router.refresh();
      } catch {
        toast.error(locale === "en" ? "Negotiation report failed" : "گزارش مذاکره ناموفق بود");
      }
    });

  return (
    <div className="w-full space-y-4 p-4 text-start">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="me-auto flex items-center gap-2 text-sm font-semibold">
          <Handshake className="size-4 text-risk-safe" />
          {t("title")}
        </h3>
        <Select value={perspective} onValueChange={(v) => setPerspective(v as Perspective)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((p) => (
              <SelectItem key={p} value={p}>
                {pickBilingual(PERSPECTIVE_LABELS[p], locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="gap-1.5" onClick={generate} disabled={generating}>
          <Sparkles className="size-3.5" />
          {report ? t("generateReport") : t("generateReport")}
        </Button>
      </div>

      {!report ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("noReport")}</p>
      ) : (
        <NegotiationBody key={report.id} report={report} locale={locale} contractId={data.contract.id} t={t} />
      )}
    </div>
  );
}

function NegotiationBody({
  report,
  locale,
  contractId,
  t,
}: {
  report: NonNullable<ReturnType<typeof useWorkspace>["data"]["negotiation"]>;
  locale: string;
  contractId: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const { data } = useWorkspace();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(report.items.filter((i) => i.accepted).map((i) => i.id)),
  );
  const [checklist, setChecklist] = useState(report.checklist);

  const clauseRisks = data.clauses
    .filter((c) => c.risk)
    .map((c) => ({ clauseId: c.id, riskScore: c.risk!.score, confidence: c.risk!.confidence }));
  const simItems = report.items.map((i) => ({
    id: i.id,
    clauseId: i.clauseId,
    currentRisk: i.currentRisk,
    projectedRisk: i.projectedRisk,
  }));
  const sim = useMemo(
    () => simulateRiskReduction(clauseRisks, simItems, selected),
    [clauseRisks, simItems, selected],
  );

  const toggle = (id: string, v: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });

  const checkedCount = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-4">
      {/* opportunity + simulator */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="flex flex-col items-center gap-1 p-4">
            <ScoreRing value={report.opportunityScore} size={104} color="hsl(var(--primary))" locale={locale} label={t("opportunityScore")} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 p-4">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <TrendingDown className="size-3.5 text-risk-safe" />
              {t("projectedOverall")}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-muted-foreground/60 line-through tabular-nums">
                {locale === "fa" ? toPersianDigits(sim.currentOverall) : sim.currentOverall}
              </span>
              <ScoreRingInline value={sim.projectedOverall} locale={locale} />
            </div>
            <motion.span
              key={sim.delta}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-full bg-risk-safe/15 px-2 py-0.5 text-xs font-bold text-risk-safe"
            >
              −<AnimatedNumber value={sim.delta} locale={locale} /> {t("riskReduction")}
            </motion.span>
          </CardContent>
        </Card>
      </div>

      {/* talking points */}
      {report.talkingPoints.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Megaphone className="size-4 text-primary" />
              {t("talkingPoints")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {report.talkingPoints.map((p, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: locale === "fa" ? -8 : 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex gap-2 text-xs leading-6"
              >
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                {p}
              </motion.div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* checklist */}
      {checklist.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <ListChecks className="size-4 text-risk-safe" />
                {t("checklist")}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {locale === "fa" ? toPersianDigits(checkedCount) : checkedCount}/
                {locale === "fa" ? toPersianDigits(checklist.length) : checklist.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {checklist.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  const done = !c.done;
                  setChecklist((prev) => prev.map((x) => (x.id === c.id ? { ...x, done } : x)));
                  void toggleChecklistAction(c.id, done, contractId);
                }}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-start transition-colors hover:bg-muted"
              >
                <span
                  className={`grid size-4 shrink-0 place-items-center rounded border transition-colors ${
                    c.done ? "border-risk-safe bg-risk-safe text-background" : "border-muted-foreground/40"
                  }`}
                >
                  {c.done && <Check className="size-3" />}
                </span>
                <span className={`text-xs ${c.done ? "text-muted-foreground line-through" : ""}`}>{c.label}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* items */}
      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("items")}</p>
        <div className="space-y-2.5">
          {report.items.map((item) => (
            <NegotiationItemCard
              key={item.id}
              item={item}
              included={selected.has(item.id)}
              onToggle={(v) => toggle(item.id, v)}
              locale={locale}
            />
          ))}
        </div>
      </div>

      <Wargame contractId={contractId} perspective={report.perspective} locale={locale} />
    </div>
  );
}

function ScoreRingInline({ value, locale }: { value: number; locale: string }) {
  return (
    <span className="text-3xl font-bold tabular-nums" style={{ color: SEVERITY_HEX[scoreToSeverity(value)] }}>
      <AnimatedNumber value={value} locale={locale} />
    </span>
  );
}
