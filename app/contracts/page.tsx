import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Scale, FileText, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle, LocaleToggle } from "@/components/shared/toggles";
import { listContracts } from "@/lib/db/queries";
import { CONTRACT_TYPE_LABELS } from "@/lib/constants";
import { pickBilingual } from "@/lib/i18n/localize";
import { scoreToSeverity, SEVERITY_HEX } from "@/lib/risk/colors";
import { toPersianDigits } from "@/lib/utils";
import type { ContractType } from "@/lib/ai/schemas";

export default async function ContractsPage() {
  const locale = await getLocale();
  const t = await getTranslations("contracts");
  const tc = await getTranslations("common");
  const contracts = await listContracts(locale);

  return (
    <main className="mesh-bg min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Scale className="size-4" />
          </span>
          {tc("appName")}
        </Link>
        <div className="flex items-center gap-1">
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {contracts.map((c) => {
            const risk = c.overallRisk ?? 0;
            const color = SEVERITY_HEX[scoreToSeverity(risk)];
            return (
              <Link key={c.id} href={`/contracts/${c.id}`}>
                <Card className="group h-full p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 grid size-9 place-items-center rounded-lg bg-muted">
                        <FileText className="size-4 text-muted-foreground" />
                      </span>
                      <div>
                        <h3 className="font-semibold leading-snug group-hover:text-primary">{c.title}</h3>
                        <div className="mt-1.5 flex items-center gap-2">
                          <Badge variant="muted">{pickBilingual(CONTRACT_TYPE_LABELS[c.type as ContractType], locale)}</Badge>
                          <span className="text-xs text-muted-foreground">{c.status}</span>
                        </div>
                      </div>
                    </div>
                    {c.overallRisk != null && (
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-bold tabular-nums" style={{ color }}>
                          {locale === "fa" ? toPersianDigits(risk) : risk}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{t("overallRisk")}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-end text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    {t("open")}
                    <ArrowLeft className="ms-1 size-3 rtl:rotate-0 ltr:rotate-180" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
