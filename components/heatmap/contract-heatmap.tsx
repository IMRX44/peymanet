"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { ShieldCheck, Loader2 } from "lucide-react";
import { RiskClause } from "@/components/heatmap/risk-clause";
import { RiskMinimap } from "@/components/heatmap/risk-minimap";
import { useWorkspace } from "@/components/workspace/workspace-store";
import { SEVERITY_LABELS } from "@/lib/constants";
import { SEVERITY_HEX } from "@/lib/risk/colors";
import { pickBilingual } from "@/lib/i18n/localize";
import { toPersianDigits } from "@/lib/utils";
import type { Severity } from "@/lib/ai/schemas";

const SEVERITIES: Severity[] = ["safe", "medium", "high", "critical"];

export function ContractHeatmap() {
  const t = useTranslations("heatmap");
  const { data, analyzing, progress, locale } = useWorkspace();

  return (
    <div className="flex h-full flex-col">
      {/* Streaming progress bar */}
      <AnimatePresence>
        {analyzing && progress && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b bg-card/60 px-5 backdrop-blur"
          >
            <div className="flex items-center gap-3 py-2.5">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground">
                {t("analyzingProgress", {
                  current: locale === "fa" ? toPersianDigits(progress.current) : progress.current,
                  total: locale === "fa" ? toPersianDigits(progress.total) : progress.total,
                })}
              </span>
              <div className="ms-auto h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-primary"
                  animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                  transition={{ ease: "easeOut" }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 gap-3 overflow-y-auto scrollbar-thin px-5 py-5">
        <div className="mx-auto w-full max-w-2xl space-y-2.5">
          <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            {t("legend")}:
            {SEVERITIES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: SEVERITY_HEX[s] }} />
                {pickBilingual(SEVERITY_LABELS[s], locale)}
              </span>
            ))}
          </div>

          {data.clauses.map((clause, i) => (
            <motion.div
              key={clause.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <RiskClause clause={clause} />
            </motion.div>
          ))}
        </div>

        <RiskMinimap />
      </div>
    </div>
  );
}
