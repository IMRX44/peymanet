import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const locales = ["fa", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = (process.env.DEFAULT_LOCALE as Locale) || "fa";

export { isRtl } from "@/lib/i18n/localize";

/**
 * next-intl "without i18n routing" setup: the active locale is read from a
 * cookie (toggled in the UI) and falls back to DEFAULT_LOCALE. No locale-prefixed
 * routes or middleware required.
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get("locale")?.value;
  const locale: Locale =
    cookieLocale && (locales as readonly string[]).includes(cookieLocale)
      ? (cookieLocale as Locale)
      : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
