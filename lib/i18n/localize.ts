import type { Bilingual } from "@/lib/ai/schemas";

/**
 * Bilingual fields (explanation, reasoning, strategy, ...) are stored as JSON
 * strings ({ fa, en }) inside String columns. `localize` transparently resolves
 * either a bilingual JSON string OR a plain string to the active locale.
 */
export function localize(value: string | null | undefined, locale: string): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && ("fa" in parsed || "en" in parsed)) {
      return (parsed[locale] as string) ?? parsed.fa ?? parsed.en ?? "";
    }
  } catch {
    // not JSON — fall through
  }
  return value;
}

export function pickBilingual(b: Bilingual | null | undefined, locale: string): string {
  if (!b) return "";
  return locale === "en" ? b.en : b.fa;
}

export function isRtl(locale: string): boolean {
  return locale === "fa";
}

/** Serialize a bilingual object for storage in a String column. */
export function encodeBilingual(b: Bilingual | null | undefined): string | null {
  return b ? JSON.stringify(b) : null;
}
