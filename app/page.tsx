import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldAlert, GitBranch, Handshake, ArrowLeft, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/toggles";
import { getCurrentUser } from "@/lib/auth";

export default async function LandingPage() {
  const t = await getTranslations("landing");
  const tc = await getTranslations("common");
  const user = await getCurrentUser();
  const demoHref = user ? "/contracts" : "/login";

  const features = [
    { icon: ShieldAlert, title: t("feature1Title"), desc: t("feature1Desc"), color: "text-risk-high" },
    { icon: GitBranch, title: t("feature2Title"), desc: t("feature2Desc"), color: "text-primary" },
    { icon: Handshake, title: t("feature3Title"), desc: t("feature3Desc"), color: "text-risk-safe" },
  ];

  return (
    <main className="mesh-bg relative min-h-screen overflow-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Scale className="size-4" />
          </span>
          <span>{tc("appName")}</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-16 pt-16 text-center sm:pt-24">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          {t("badge")}
        </div>
        <h1 className="text-balance text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          <span className="text-gradient">{t("title")}</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
          {t("subtitle")}
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="gap-2 shadow-lg shadow-primary/20">
            <Link href={demoHref}>
              {t("ctaPrimary")}
              <ArrowLeft className="size-4 rtl:rotate-0 ltr:rotate-180" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/contracts">{t("ctaSecondary")}</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-6 pb-24 sm:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="glass group rounded-2xl p-6 transition-all hover:-translate-y-1 hover:shadow-xl">
            <div className="mb-4 grid size-11 place-items-center rounded-xl bg-card">
              <f.icon className={`size-5 ${f.color}`} />
            </div>
            <h3 className="mb-1.5 font-semibold">{f.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">{tc("disclaimer")}</footer>
    </main>
  );
}
