import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Scale } from "lucide-react";
import { ThemeToggle } from "@/components/shared/toggles";
import { ContractsGrid } from "@/components/contracts/contracts-grid";
import { listContracts } from "@/lib/db/queries";

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
          <ThemeToggle />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

        <ContractsGrid contracts={contracts} />
      </section>
    </main>
  );
}
