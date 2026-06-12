"use client";

import Link from "next/link";
import { PenLine, ShieldAlert, GitCommitHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type ContractTab = "editor" | "risk" | "changes";

const TABS: { key: ContractTab; label: string; icon: typeof PenLine }[] = [
  { key: "editor", label: "ویرایشگر", icon: PenLine },
  { key: "risk", label: "تحلیل ریسک", icon: ShieldAlert },
  { key: "changes", label: "تغییرات", icon: GitCommitHorizontal },
];

/**
 * Shared segmented toggle that keeps the header layout identical across the
 * editor / risk-analysis / changes views. Navigation is route-based so the
 * surrounding chrome never reshuffles when switching tabs.
 */
export function ContractTabBar({ contractId, active }: { contractId: string; active: ContractTab }) {
  const href: Record<ContractTab, string> = {
    editor: `/contracts/${contractId}/edit`,
    risk: `/contracts/${contractId}`,
    changes: `/contracts/${contractId}?view=changes`,
  };

  return (
    <div className="flex items-center rounded-lg bg-muted p-0.5">
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={href[tab.key]}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              isActive ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-3.5" />
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
