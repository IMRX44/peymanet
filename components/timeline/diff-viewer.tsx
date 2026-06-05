"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { DiffSegment } from "@/lib/diff/textDiff";

export function DiffViewer({ segments, className }: { segments: DiffSegment[]; className?: string }) {
  return (
    <div dir="auto" className={cn("whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-[13px] leading-7", className)}>
      {segments.map((s, i) => {
        if (s.type === "equal") return <span key={i} className="text-foreground/60">{s.value}</span>;
        return (
          <motion.span
            key={i}
            initial={{ opacity: 0, backgroundColor: "transparent" }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className={cn(
              "rounded px-0.5",
              s.type === "added"
                ? "bg-risk-safe/25 text-risk-safe"
                : "bg-risk-critical/20 text-risk-critical line-through decoration-risk-critical/60",
            )}
          >
            {s.value}
          </motion.span>
        );
      })}
    </div>
  );
}
