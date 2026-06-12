"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Building2, ShieldCheck, ShieldX, HelpCircle, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkspace } from "@/components/workspace/workspace-store";
import { checkPolicyComplianceAction } from "@/app/actions";
import { cn } from "@/lib/utils";
import type { PolicyComplianceResult, PolicyStatus } from "@/lib/ai/schemas";

const STATUS_META: Record<PolicyStatus, { label: string; cls: string; icon: typeof ShieldCheck }> = {
  compliant: { label: "منطبق", cls: "text-risk-safe", icon: ShieldCheck },
  violation: { label: "مغایر", cls: "text-risk-critical", icon: ShieldX },
  unclear: { label: "نامشخص", cls: "text-risk-medium", icon: HelpCircle },
};

export function PolicyPanel() {
  const { data } = useWorkspace();
  const contractId = data.contract.id;
  const document = data.version?.contentText ?? "";
  const storageKey = `peymanet:policies:${contractId}`;

  const [policies, setPolicies] = useState("");
  const [saved, setSaved] = useState(false);
  const [result, setResult] = useState<PolicyComplianceResult | null>(null);
  const [pending, start] = useTransition();

  // Persist policies locally so each contract keeps its own org policies.
  useEffect(() => {
    try {
      setPolicies(localStorage.getItem(storageKey) ?? "");
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const persist = (value: string) => {
    setPolicies(value);
    setSaved(false);
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      /* ignore */
    }
  };

  const check = () =>
    start(async () => {
      const res = await checkPolicyComplianceAction({ contractId, document, policies });
      if (res.ok) {
        setResult(res.result);
        setSaved(true);
      } else {
        toast.error(res.error ?? "بررسی انطباق ناموفق بود");
      }
    });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Building2 className="size-4 text-primary" />
          سیاست‌های سازمان
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <p className="text-[11px] leading-5 text-muted-foreground">
          سیاست‌های داخلی سازمان را وارد کنید (هر خط یک سیاست). سپس انطباق قرارداد با آن‌ها بررسی می‌شود.
        </p>
        <textarea
          dir="rtl"
          value={policies}
          onChange={(e) => persist(e.target.value)}
          rows={5}
          placeholder={"مثال:\n— سقف مسئولیت نباید از مبلغ قرارداد بیشتر باشد.\n— دورهٔ اطلاع فسخ حداقل ۳۰ روز باشد.\n— مالکیت فکری فقط شامل آثار مرتبط با پروژه باشد."}
          className="w-full resize-y rounded-lg border bg-background/60 p-2.5 text-xs leading-6 outline-none transition-colors focus:border-primary/50"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" className="flex-1 gap-1.5" onClick={check} disabled={pending || !policies.trim()}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
            بررسی انطباق با سیاست‌ها
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-[10px] text-risk-safe">
              <Save className="size-3" />
              ذخیره شد
            </span>
          )}
        </div>

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-1.5 overflow-hidden pt-1"
            >
              <p className="text-[11px] font-medium text-muted-foreground">{result.summary.fa}</p>
              {result.findings.map((f, i) => {
                const meta = STATUS_META[f.status];
                return (
                  <div key={i} className="rounded-lg border bg-muted/30 p-2 text-[11px] leading-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 font-medium text-foreground/80">{f.policy}</p>
                      <Badge variant="outline" className={cn("shrink-0 gap-1 text-[9px]", meta.cls)}>
                        <meta.icon className="size-2.5" />
                        {meta.label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-muted-foreground">{f.detail.fa}</p>
                    {f.clause && (
                      <p className="mt-1 rounded bg-background/60 p-1.5 text-[10px] italic text-muted-foreground">«{f.clause}»</p>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
