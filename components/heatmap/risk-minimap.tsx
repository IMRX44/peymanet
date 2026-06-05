"use client";

import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useWorkspace } from "@/components/workspace/workspace-store";
import { SEVERITY_HEX } from "@/lib/risk/colors";
import { toPersianDigits } from "@/lib/utils";

export function RiskMinimap() {
  const { data, liveScores, focusClause, locale, analyzing } = useWorkspace();

  return (
    <div className="sticky top-4 flex w-7 flex-col gap-1">
      {data.clauses.map((c) => {
        const live = liveScores[c.id];
        const severity = live?.severity ?? c.risk?.severity ?? null;
        const score = live?.score ?? c.risk?.score ?? null;
        const color = severity ? SEVERITY_HEX[severity] : "hsl(var(--muted))";
        return (
          <Tooltip key={c.id}>
            <TooltipTrigger asChild>
              <motion.button
                onClick={() => focusClause(c.id)}
                className="h-5 w-full rounded-sm transition-transform hover:scale-110"
                style={{ background: color }}
                initial={{ opacity: 0.3, scaleX: 0.6 }}
                animate={{ opacity: severity ? 1 : 0.35, scaleX: 1 }}
                transition={{ duration: 0.4 }}
              >
                {analyzing && !severity && <span className="block h-full w-full animate-pulse rounded-sm bg-foreground/10" />}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side={locale === "fa" ? "right" : "left"}>
              <span className="text-xs">
                {c.title}
                {score != null && ` · ${locale === "fa" ? toPersianDigits(score) : score}`}
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
