import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Scale, Settings, LogOut, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/shared/toggles";
import { ContractsGrid } from "@/components/contracts/contracts-grid";
import { listContracts } from "@/lib/db/queries";
import { getCurrentUser, isAdmin, isApproved } from "@/lib/auth";
import { signOutAction } from "@/app/actions";

export default async function ContractsPage() {
  const locale = await getLocale();
  const t = await getTranslations("contracts");
  const tc = await getTranslations("common");
  const ta = await getTranslations("admin");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isApproved(user)) redirect("/pending");
  const admin = isAdmin(user);
  // Admins see every contract; everyone else sees only their own.
  const contracts = await listContracts(locale, admin ? undefined : user.id);

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
          <span className="me-1 hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
            {user.name}
            {admin && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <ShieldCheck className="size-3" />
                {ta("adminBadge")}
              </span>
            )}
          </span>
          {admin && (
            <Link
              href="/admin"
              className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={ta("title")}
            >
              <ShieldCheck className="size-4" />
            </Link>
          )}
          <Link
            href="/settings"
            className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="کلیدهای هوش مصنوعی"
          >
            <Settings className="size-4" />
          </Link>
          <ThemeToggle />
          <form
            action={async () => {
              "use server";
              await signOutAction();
              redirect("/login");
            }}
          >
            <button
              type="submit"
              className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="خروج"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

        <ContractsGrid contracts={contracts} showOwner={admin} />
      </section>
    </main>
  );
}
