"use client";

import { motion } from "framer-motion";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { RiskFloatingCard } from "@/components/heatmap/risk-floating-card";
import { useWorkspace } from "@/components/workspace/workspace-store";
import { SEVERITY_HEX } from "@/lib/risk/colors";
import { cn, toPersianDigits } from "@/lib/utils";
import type { WorkspaceClause } from "@/lib/db/queries";
import type { Severity } from "@/lib/ai/schemas";

const TINT: Record<Severity, number> = { safe: 0.1, medium: 0.14, high: 0.2, critical: 0.27 };

export function RiskClause({ clause }: { clause: WorkspaceClause }) {
  const { liveScores, locale, selectedClauseId, select } = useWorkspace();
  const live = liveScores[clause.id];
  const severity: Severity | null = live?.severity ?? clause.risk?.severity ?? null;
  const score = live?.score ?? clause.risk?.score ?? null;
  const selected = selectedClauseId === clause.id;

  return (
    <HoverCard openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>
        <motion.div
          id={`clause-${clause.id}`}
          onClick={() => select(selected ? null : clause.id)}
          className={cn(
            "group relative cursor-pointer rounded-lg border-s-2 px-3.5 py-3 transition-all",
            severity === "critical" && "animate-risk-pulse",
            selected && "ring-2 ring-primary",
          )}
          style={{ borderColor: severity ? SEVERITY_HEX[severity] : "hsl(var(--border))" }}
          whileHover={{ x: locale === "fa" ? -2 : 2 }}
        >
          {severity && (
            <motion.div
              key={severity}
              className="pointer-events-none absolute inset-0 rounded-lg"
              style={{ background: SEVERITY_HEX[severity] }}
              initial={{ opacity: 0 }}
              animate={{ opacity: TINT[severity] }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          )}

          <div className="relative">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-foreground/90">{clause.title}</h4>
              {score != null && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
                  style={{ color: SEVERITY_HEX[severity ?? "safe"], background: `${SEVERITY_HEX[severity ?? "safe"]}22` }}
                >
                  {locale === "fa" ? toPersianDigits(score) : score}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[13px] leading-7 text-foreground/80">{clause.text}</p>
          </div>
        </motion.div>
      </HoverCardTrigger>
      <HoverCardContent side={locale === "fa" ? "left" : "right"} align="start" className="w-96">
        <RiskFloatingCard clause={clause} />
      </HoverCardContent>
    </HoverCard>
  );
}
