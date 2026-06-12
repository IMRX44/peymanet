"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Sparkles, Wand2, ArrowRightLeft, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SeverityBadge } from "@/components/shared/severity-badge";
import { Meter } from "@/components/shared/meter";
import { useWorkspace } from "@/components/workspace/workspace-store";
import { applyFixAction } from "@/app/actions";
import { RISK_CATEGORY_LABELS } from "@/lib/constants";
import { SEVERITY_HEX } from "@/lib/risk/colors";
import { pickBilingual } from "@/lib/i18n/localize";
import { toPersianDigits, formatPercent } from "@/lib/utils";
import type { WorkspaceClause } from "@/lib/db/queries";

export function RiskFloatingCard({ clause }: { clause: WorkspaceClause }) {
  const t = useTranslations("heatmap");
  const { locale, setActiveTab } = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const risk = clause.risk;

  if (!risk) {
    return <p className="text-sm text-muted-foreground">{t("noRisksYet")}</p>;
  }

  const apply = () =>
    start(async () => {
      const res = await applyFixAction(clause.id);
      if (res.ok) {
        toast.success(locale === "en" ? "Fix applied — risk reduced" : "اصلاح اعمال شد — ریسک کاهش یافت");
        router.refresh();
      } else {
        toast.error(locale === "en" ? "Could not apply fix" : "اعمال اصلاح ناموفق بود");
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <SeverityBadge severity={risk.severity} locale={locale} />
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold tabular-nums" style={{ color: SEVERITY_HEX[risk.severity] }}>
            {locale === "fa" ? toPersianDigits(risk.score) : risk.score}
          </span>
          <span className="text-[10px] text-muted-foreground">/۱۰۰</span>
        </div>
      </div>

      <Meter value={risk.score / 100} color={SEVERITY_HEX[risk.severity]} height={6} />

      <div className="flex flex-wrap gap-1">
        {risk.categories.map((c) => (
          <Badge key={c} variant="muted" className="text-[10px]">
            {pickBilingual(RISK_CATEGORY_LABELS[c], locale)}
          </Badge>
        ))}
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {t("confidence")}: {formatPercent(risk.confidence, locale)}
        </Badge>
      </div>

      {risk.citation && (
        <p className="flex items-start gap-1.5 rounded-md bg-muted/60 p-2 text-xs italic text-muted-foreground">
          <Quote className="mt-0.5 size-3 shrink-0" />
          {risk.citation}
        </p>
      )}

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground">{t("explanation")}</p>
        <p className="mt-0.5 text-sm leading-6">{risk.explanation}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground">{t("reasoning")}</p>
        <p className="mt-0.5 text-sm leading-6 text-foreground/80">{risk.reasoning}</p>
      </div>

      {risk.suggestedFix && (
        <div className="rounded-lg border border-risk-safe/30 bg-risk-safe/10 p-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-risk-safe">
            <Sparkles className="size-3" />
            {t("suggestedFix")}
          </p>
          <p className="mt-1 text-sm leading-6">{risk.suggestedFix}</p>
        </div>
      )}

      {risk.alternativeClause && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground">{t("alternativeClause")}</p>
          <p dir="rtl" className="mt-0.5 rounded-md bg-muted/60 p-2 text-start text-xs leading-6">
            {risk.alternativeClause}
          </p>
        </div>
      )}

      <Separator />
      <div className="flex items-center gap-2">
        <Button size="sm" className="flex-1 gap-1.5" onClick={apply} disabled={pending || !risk.alternativeClause}>
          <Wand2 className="size-3.5" />
          {t("applyFix")}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setActiveTab("negotiation")}>
          <ArrowRightLeft className="size-3.5" />
          {t("sendToNegotiation")}
        </Button>
      </div>
    </div>
  );
}
