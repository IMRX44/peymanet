import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { isRtl } from "@/i18n/request";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "پیمان‌نت — Peymanet · LegalAI",
  description:
    "تحلیل هوشمند قرارداد: نقشه حرارتی ریسک، خط‌زمانی نسخه‌ها و دستیار مذاکره · AI Contract Risk Heatmap, Timeline & Negotiation Assistant",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = isRtl(locale) ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
