"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { TriangleAlert, FileWarning, ScrollText, Lightbulb, ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/shared/score-ring";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { useWorkspace } from "@/components/workspace/workspace-store";
import { SEVERITY_HEX } from "@/lib/risk/colors";
import { IMPACT_LABELS } from "@/lib/constants";
import { pickBilingual } from "@/lib/i18n/localize";
import { toPersianDigits } from "@/lib/utils";

export function RiskDashboard() {
  const t = useTranslations("heatmap");
  const { data, locale, focusClause } = useWorkspace();
  const analysis = data.analysis;

  const topRisks = [...data.clauses]
    .filter((c) => c.risk)
    .sort((a, b) => (b.risk?.score ?? 0) - (a.risk?.score ?? 0))
    .slice(0, 10);

  if (!analysis) {
    return <p className="p-4 text-sm text-muted-foreground">{t("noRisksYet")}</p>;
  }

  return (
    <div className="space-y-4 p-4">
      {/* Overall */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center gap-3 p-5">
          <ScoreRing value={analysis.overallRisk} locale={locale} label={t("overallRisk")} />
          {analysis.headline && (
            <p className="text-balance text-center text-sm text-muted-foreground">{analysis.headline}</p>
          )}
        </CardContent>
      </Card>

      {/* Top risks */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TriangleAlert className="size-4 text-risk-high" />
            {t("topRisks")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {topRisks.map((c, i) => (
            <motion.button
              key={c.id}
              onClick={() => focusClause(c.id)}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start transition-colors hover:bg-muted"
            >
              <span className="size-2 shrink-0 rounded-full" style={{ background: SEVERITY_HEX[c.risk!.severity] }} />
              <span className="line-clamp-1 flex-1 text-xs">{c.title}</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: SEVERITY_HEX[c.risk!.severity] }}>
                {locale === "fa" ? toPersianDigits(c.risk!.score) : c.risk!.score}
              </span>
              <ChevronLeft className="size-3 text-muted-foreground rtl:rotate-0 ltr:rotate-180" />
            </motion.button>
          ))}
        </CardContent>
      </Card>

      {/* Missing clauses */}
      {analysis.missingClauses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FileWarning className="size-4 text-risk-medium" />
              {t("missingClauses")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {analysis.missingClauses.map((m, i) => (
              <div key={i} className="rounded-lg border bg-muted/30 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-medium">{m.type}</span>
                  <SeverityBadge severity={m.importance} locale={locale} />
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{m.rationale}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Compliance */}
      {analysis.complianceIssues.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ScrollText className="size-4 text-risk-high" />
              {t("complianceIssues")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {analysis.complianceIssues.map((c, i) => (
              <div key={i} className="rounded-lg border bg-muted/30 p-2.5">
                <div className="flex items-center justify-between">
                  <Badge variant="muted" className="text-[10px]">{c.framework}</Badge>
                  <SeverityBadge severity={c.severity} locale={locale} />
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{c.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Lightbulb className="size-4 text-primary" />
              {t("recommendations")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {analysis.recommendations.map((r, i) => (
              <div key={i} className="flex gap-2.5 rounded-lg border bg-muted/30 p-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                  {locale === "fa" ? toPersianDigits(i + 1) : i + 1}
                </span>
                <div>
                  <p className="text-xs font-semibold">{r.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{r.description}</p>
                  <Badge variant="outline" className="mt-1 text-[9px]">
                    {pickBilingual(IMPACT_LABELS[r.priority], locale)}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
