import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Scale, Clock, LogOut } from "lucide-react";
import { getCurrentUser, isApproved } from "@/lib/auth";
import { signOutAction } from "@/app/actions";
import { ThemeToggle } from "@/components/shared/toggles";

export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isApproved(user)) redirect("/contracts");
  const t = await getTranslations("pending");

  return (
    <main className="mesh-bg relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-24 start-1/2 size-[480px] -translate-x-1/2 rounded-full bg-risk-medium/20 blur-3xl" />
      <div className="glass relative w-full max-w-md rounded-3xl border p-8 text-center shadow-2xl">
        <div className="absolute end-4 top-4">
          <ThemeToggle />
        </div>
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-risk-medium to-amber-500 text-white shadow-lg shadow-risk-medium/30">
          <Clock className="size-7" />
        </span>
        <h1 className="flex items-center justify-center gap-2 text-xl font-bold">
          <Scale className="size-5 text-primary" />
          {t("title")}
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{t("body")}</p>
        <div className="mt-5 rounded-xl border bg-card/60 p-3 text-start text-xs text-muted-foreground" dir="ltr">
          {user.email}
        </div>

        <form
          action={async () => {
            "use server";
            await signOutAction();
            redirect("/login");
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <LogOut className="size-4" />
            {t("signOut")}
          </button>
        </form>
      </div>
    </main>
  );
}
