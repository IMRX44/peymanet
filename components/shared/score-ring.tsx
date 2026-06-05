"use client";

import { motion } from "framer-motion";
import { AnimatedNumber } from "./animated-number";
import { scoreToSeverity, SEVERITY_HEX } from "@/lib/risk/colors";
import { cn } from "@/lib/utils";

export function ScoreRing({
  value,
  size = 128,
  stroke = 11,
  color,
  label,
  sublabel,
  locale = "fa",
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
  sublabel?: string;
  locale?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const ringColor = color ?? SEVERITY_HEX[scoreToSeverity(value)];

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 6px ${ringColor}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedNumber value={value} locale={locale} className="text-3xl font-bold tabular-nums" />
        {label && <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">{label}</span>}
        {sublabel && <span className="text-[10px] text-muted-foreground/70">{sublabel}</span>}
      </div>
    </div>
  );
}
