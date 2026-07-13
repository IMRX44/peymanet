import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Scale, ArrowRight, ShieldCheck } from "lucide-react";
import { getCurrentUser, isAdmin, isApproved } from "@/lib/auth";
import { listUsersForAdmin, costByUser } from "@/lib/db/queries";
import { ThemeToggle } from "@/components/shared/toggles";
import { AdminPanel } from "@/components/admin/admin-panel";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isApproved(user)) redirect("/pending");
  if (!isAdmin(user)) redirect("/contracts");

  const t = await getTranslations("admin");
  const [users, costs] = await Promise.all([listUsersForAdmin(), costByUser()]);

  return (
    <main className="mesh-bg min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <Link href="/contracts" className="flex items-center gap-2 font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Scale className="size-4" />
          </span>
          پیمانت
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Link
            href="/contracts"
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            قراردادها
            <ArrowRight className="size-3.5 rtl:rotate-180" />
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldCheck className="size-6 text-primary" />
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

        <AdminPanel users={users} costs={costs} currentUserId={user.id} />
      </section>
    </main>
  );
}
