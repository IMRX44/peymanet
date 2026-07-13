"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Users,
  Wallet,
  Check,
  ShieldCheck,
  ShieldOff,
  Clock,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { setUserApprovedAction, setUserRoleAction } from "@/app/actions";
import { cn, toPersianDigits } from "@/lib/utils";

type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  approved: boolean;
  createdAt: string;
  contractsCount: number;
};

type AdminCostRow = {
  userId: string | null;
  name: string | null;
  email: string | null;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
};

function fmtUsd(usd: number): string {
  return `$${usd.toFixed(usd >= 1 ? 2 : 4)}`;
}
function fmtInt(n: number): string {
  return toPersianDigits(n.toLocaleString("en-US"));
}

export function AdminPanel({
  users,
  costs,
  currentUserId,
}: {
  users: AdminUserRow[];
  costs: AdminCostRow[];
  currentUserId: string;
}) {
  const t = useTranslations("admin");
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "خطا");
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });

  const pendingCount = users.filter((u) => !u.approved && u.role !== "admin").length;
  const totalCost = costs.reduce((s, c) => s + c.costUsd, 0);
  const totalCalls = costs.reduce((s, c) => s + c.calls, 0);

  return (
    <div className="mt-6 space-y-8">
      {/* ── Users ── */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-primary" />
          {t("usersTitle")}
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-risk-medium/15 px-2 py-0.5 text-[11px] font-medium text-risk-medium">
              <Clock className="size-3" />
              {toPersianDigits(pendingCount)} {t("pendingCount")}
            </span>
          )}
        </h2>

        <div className="mt-3 space-y-2.5">
          {users.map((u) => {
            const admin = u.role === "admin";
            const isSelf = u.id === currentUserId;
            return (
              <div
                key={u.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 rounded-2xl border bg-card/60 p-3.5 transition-colors",
                  !u.approved && !admin && "border-risk-medium/40 bg-risk-medium/5",
                )}
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl",
                    admin
                      ? "bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <UserRound className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 truncate text-sm font-semibold">
                    {u.name || u.email.split("@")[0]}
                    {isSelf && <span className="text-[10px] text-muted-foreground">({t("you")})</span>}
                    {admin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        <ShieldCheck className="size-3" /> {t("roleAdmin")}
                      </span>
                    ) : u.approved ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-risk-safe/15 px-1.5 py-0.5 text-[10px] font-medium text-risk-safe">
                        <Check className="size-3" /> {t("statusApproved")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-risk-medium/15 px-1.5 py-0.5 text-[10px] font-medium text-risk-medium">
                        <Clock className="size-3" /> {t("statusPending")}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
                    {u.email} · {toPersianDigits(u.contractsCount)} {t("contractsWord")}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {!admin && !u.approved && (
                    <Button
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      disabled={pending}
                      onClick={() => run(() => setUserApprovedAction(u.id, true), t("approvedToast"))}
                    >
                      <Check className="size-3.5" /> {t("approve")}
                    </Button>
                  )}
                  {!admin && u.approved && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 text-xs text-muted-foreground"
                      disabled={pending}
                      onClick={() => run(() => setUserApprovedAction(u.id, false), t("revokedToast"))}
                    >
                      <ShieldOff className="size-3.5" /> {t("revoke")}
                    </Button>
                  )}
                  {!isSelf && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 text-xs"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => setUserRoleAction(u.id, !admin),
                          admin ? t("demotedToast") : t("promotedToast"),
                        )
                      }
                    >
                      {admin ? <ShieldOff className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
                      {admin ? t("makeMember") : t("makeAdmin")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Cost per user ── */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Wallet className="size-4 text-risk-safe" />
          {t("costTitle")}
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">{t("costHint")}</p>

        <div className="mt-3 overflow-x-auto rounded-2xl border bg-card/60">
          <table className="w-full min-w-[520px] text-start text-xs">
            <thead className="border-b bg-muted/40 text-[11px] text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">{t("colUser")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("colCalls")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("colTokens")}</th>
                <th className="px-4 py-2.5 text-end font-medium">{t("colCost")}</th>
              </tr>
            </thead>
            <tbody>
              {costs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    {t("noCost")}
                  </td>
                </tr>
              )}
              {costs.map((c) => (
                <tr key={c.userId ?? "system"} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{c.name || c.email || t("system")}</span>
                    {c.email && <span className="ms-2 text-muted-foreground" dir="ltr">{c.email}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-end tabular-nums">{fmtInt(c.calls)}</td>
                  <td className="px-4 py-2.5 text-end tabular-nums text-muted-foreground">
                    {fmtInt(c.promptTokens + c.completionTokens)}
                  </td>
                  <td className="px-4 py-2.5 text-end font-semibold tabular-nums" dir="ltr">
                    {fmtUsd(c.costUsd)}
                  </td>
                </tr>
              ))}
            </tbody>
            {costs.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="px-4 py-2.5">{t("total")}</td>
                  <td className="px-4 py-2.5 text-end tabular-nums">{fmtInt(totalCalls)}</td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-end tabular-nums" dir="ltr">
                    {fmtUsd(totalCost)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  );
}
