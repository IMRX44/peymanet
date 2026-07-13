import Link from "next/link";
import { redirect } from "next/navigation";
import { Scale, ArrowRight } from "lucide-react";
import { getCurrentUser, isApproved } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ThemeToggle } from "@/components/shared/toggles";
import { ApiKeys } from "@/components/settings/api-keys";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isApproved(user)) redirect("/pending");

  const creds = await prisma.apiCredential.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, provider: true, baseUrl: true, model: true, isActive: true, createdAt: true },
  });

  return (
    <main className="mesh-bg min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
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

      <section className="mx-auto max-w-3xl px-6 py-6">
        <h1 className="text-2xl font-bold">کلیدهای هوش مصنوعی</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          کلید API خودتان را اضافه کنید تا تحلیل‌ها با موتور دلخواه شما اجرا شوند. اگر کلیدی فعال نباشد، حالت آزمایشی (mock) استفاده می‌شود.
        </p>
        <ApiKeys credentials={creds.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))} />
      </section>
    </main>
  );
}
