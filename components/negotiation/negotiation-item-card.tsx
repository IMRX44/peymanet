"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Check, ArrowLeft, Target, Swords, MessageSquareReply, ShieldQuestion } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Meter } from "@/components/shared/meter";
import { AnimatedNumber } from "@/components/shared/animated-number";
import { acceptNegotiationItemAction } from "@/app/actions";
import { DIFFICULTY_LABELS, IMPACT_LABELS } from "@/lib/constants";
import { SEVERITY_HEX, scoreToSeverity } from "@/lib/risk/colors";
import { pickBilingual } from "@/lib/i18n/localize";
import { cn, toPersianDigits } from "@/lib/utils";
import type { NegotiationItemView } from "@/lib/db/queries";

function winColor(p: number) {
  return p >= 0.66 ? SEVERITY_HEX.safe : p >= 0.5 ? SEVERITY_HEX.medium : SEVERITY_HEX.high;
}
const IMPACT_COLOR = { low: "text-muted-foreground", medium: "text-risk-medium", high: "text-risk-high" } as const;

export function NegotiationItemCard({
  item,
  included,
  onToggle,
  locale,
}: {
  item: NegotiationItemView;
  included: boolean;
  onToggle: (v: boolean) => void;
  locale: string;
}) {
  const t = useTranslations("negotiation");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const accept = () =>
    start(async () => {
      await acceptNegotiationItemAction(item.id);
      toast.success(locale === "en" ? "Accepted — applied to contract" : "پذیرفته شد — روی قرارداد اعمال شد");
      router.refresh();
    });

  return (
    <Card className={cn("overflow-hidden transition-colors", item.accepted && "border-risk-safe/40 bg-risk-safe/5")}>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="text-sm font-bold">{item.title}</h4>
              {item.oneSided && <Badge variant="muted" className="text-[9px] text-risk-high">{t("oneSided")}</Badge>}
              {item.unfair && <Badge variant="muted" className="text-[9px] text-risk-high">{t("unfair")}</Badge>}
              {item.exploitable && <Badge variant="muted" className="text-[9px] text-risk-critical">{t("exploitable")}</Badge>}
            </div>
            {/* risk transition */}
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              <span className="font-bold tabular-nums" style={{ color: SEVERITY_HEX[scoreToSeverity(item.currentRisk)] }}>
                {locale === "fa" ? toPersianDigits(item.currentRisk) : item.currentRisk}
              </span>
              <ArrowLeft className="size-3 text-muted-foreground rtl:rotate-0 ltr:rotate-180" />
              <span className="font-bold tabular-nums" style={{ color: SEVERITY_HEX[scoreToSeverity(item.projectedRisk)] }}>
                {locale === "fa" ? toPersianDigits(item.projectedRisk) : item.projectedRisk}
              </span>
              <span className="text-muted-foreground">{t("currentRisk")} → {t("projectedRisk")}</span>
            </div>
          </div>
          {/* include in simulation */}
          <div className="flex flex-col items-center gap-1">
            <Switch checked={included} onCheckedChange={onToggle} disabled={item.accepted} />
            <span className="text-[9px] text-muted-foreground">{t("simulateTitle").split(" ")[0]}</span>
          </div>
        </div>

        {/* win probability */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Target className="size-3" />
              {t("winProbability")}
            </span>
            <AnimatedNumber
              value={Math.round(item.winProbability * 100)}
              locale={locale}
              suffix="%"
              className="font-bold tabular-nums"
            />
          </div>
          <Meter value={item.winProbability} color={winColor(item.winProbability)} height={6} />
        </div>

        {/* meters row */}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
          <div className="rounded-md bg-muted/50 py-1.5">
            <p className="text-muted-foreground">{t("difficulty")}</p>
            <p className="font-semibold">{pickBilingual(DIFFICULTY_LABELS[item.difficulty], locale)}</p>
          </div>
          <div className="rounded-md bg-muted/50 py-1.5">
            <p className="text-muted-foreground">{t("businessImpact")}</p>
            <p className={cn("font-semibold", IMPACT_COLOR[item.businessImpact])}>
              {pickBilingual(IMPACT_LABELS[item.businessImpact], locale)}
            </p>
          </div>
          <div className="rounded-md bg-muted/50 py-1.5">
            <p className="text-muted-foreground">{t("legalImpact")}</p>
            <p className={cn("font-semibold", IMPACT_COLOR[item.legalImpact])}>
              {pickBilingual(IMPACT_LABELS[item.legalImpact], locale)}
            </p>
          </div>
        </div>

        <button onClick={() => setOpen((v) => !v)} className="mt-2 flex w-full items-center justify-between text-xs text-primary">
          <span>{t("suggestedChange")}</span>
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-2.5 pt-2">
                <Field icon={<Check className="size-3" />} label={t("suggestedChange")} value={item.suggestedChange} accent="safe" />
                <Field icon={<ShieldQuestion className="size-3" />} label={t("strategy")} value={item.strategy} />
                <Field icon={<Swords className="size-3" />} label={t("counterArg")} value={item.expectedCounterArgument} accent="high" />
                <Field icon={<MessageSquareReply className="size-3" />} label={t("suggestedResponse")} value={item.suggestedResponse} accent="primary" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-3">
          {item.accepted ? (
            <Badge className="w-full justify-center gap-1 bg-risk-safe/15 py-1 text-risk-safe">
              <Check className="size-3.5" />
              {t("accepted")}
            </Badge>
          ) : (
            <Button size="sm" className="w-full gap-1.5" disabled={pending} onClick={accept}>
              <Check className="size-3.5" />
              {t("accept")}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function Field({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "safe" | "high" | "primary";
}) {
  const border =
    accent === "safe" ? "border-risk-safe/30" : accent === "high" ? "border-risk-high/30" : accent === "primary" ? "border-primary/30" : "border-border";
  return (
    <div className={cn("rounded-lg border bg-muted/20 p-2", border)}>
      <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-xs leading-6">{value}</p>
    </div>
  );
}
