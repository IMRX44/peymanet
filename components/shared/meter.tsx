"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Horizontal animated meter. `value` is 0..1. */
export function Meter({
  value,
  color = "hsl(var(--primary))",
  className,
  height = 8,
  delay = 0,
}: {
  value: number;
  color?: string;
  className?: string;
  height?: number;
  delay?: number;
}) {
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-muted", className)} style={{ height }}>
      <motion.div
        className="h-full rounded-full rtl:ms-auto"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ duration: 0.8, ease: "easeOut", delay }}
      />
    </div>
  );
}
