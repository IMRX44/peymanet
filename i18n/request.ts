import { getRequestConfig } from "next-intl/server";

export const locales = ["fa"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "fa";

export { isRtl } from "@/lib/i18n/localize";

/**
 * Peymanet is Persian-only: the active locale is always "fa". (English was
 * removed from the product — see lib/ai/prompts.ts, which forces Persian output.)
 */
export default getRequestConfig(async () => {
  const locale: Locale = "fa";
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
