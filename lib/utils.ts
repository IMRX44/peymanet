import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Stable, fast non-crypto hash (FNV-1a) — used for deterministic mock AI + cache keys. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hex content hash for cache/version dedupe. */
export function contentHash(input: string): string {
  return hashString(input).toString(16).padStart(8, "0");
}

/** Seeded pseudo-random in [0,1) from a string — deterministic across runs. */
export function seededRandom(seed: string): () => number {
  let state = hashString(seed) || 1;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

export function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/** Convert latin digits to Persian digits for fa locale display. */
export function toPersianDigits(input: string | number): string {
  const fa = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(input).replace(/[0-9]/g, (d) => fa[Number(d)]);
}

export function formatPercent(value: number, locale = "fa"): string {
  const pct = `${Math.round(value * 100)}%`;
  return locale === "fa" ? toPersianDigits(pct) : pct;
}
