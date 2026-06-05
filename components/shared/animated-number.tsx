"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { toPersianDigits } from "@/lib/utils";

export function AnimatedNumber({
  value,
  locale = "fa",
  className,
  suffix = "",
}: {
  value: number;
  locale?: string;
  className?: string;
  suffix?: string;
}) {
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 90, damping: 18, mass: 0.6 });
  const text = useTransform(spring, (v) => {
    const n = Math.round(v);
    return (locale === "fa" ? toPersianDigits(n) : String(n)) + suffix;
  });

  useEffect(() => {
    mv.set(value);
  }, [value, mv]);

  return <motion.span className={className}>{text}</motion.span>;
}
