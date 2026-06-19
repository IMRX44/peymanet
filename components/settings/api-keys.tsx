"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2, Check, Loader2, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCredentialAction, activateCredentialAction, deleteCredentialAction } from "@/app/actions";
import { cn } from "@/lib/utils";

type Cred = {
  id: string;
  label: string;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  isActive: boolean;
  createdAt: string;
};

const PROVIDERS: { value: string; label: string; hint: string }[] = [
  { value: "openai", label: "OpenAI · GPT", hint: "sk-..." },
  { value: "anthropic", label: "Anthropic · Claude", hint: "sk-ant-..." },
  { value: "google", label: "Google · Gemini", hint: "AIza..." },
  { value: "azure", label: "Azure OpenAI", hint: "کلید Azure" },
  { value: "openai-compatible", label: "سازگار با OpenAI (پروکسی/گیت‌وی)", hint: "کلید ارائه‌دهنده" },
];

export function ApiKeys({ credentials }: { credentials: Cred[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(credentials.length === 0);
  const [form, setForm] = useState({
    label: "",
    provider: "openai",
    apiKey: "",
    baseUrl: "",
    azureResource: "",
    model: "",
    modelFast: "",
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await addCredentialAction(form);
      if (!res.ok) {
        toast.error(res.error ?? "افزودن کلید ناموفق بود");
        return;
      }
      toast.success("کلید اضافه و فعال شد ✨");
      setForm({ label: "", provider: "openai", apiKey: "", baseUrl: "", azureResource: "", model: "", modelFast: "" });
      setOpen(false);
      router.refresh();
    });
  };

  const activate = (id: string | null) =>
    start(async () => {
      await activateCredentialAction(id);
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      await deleteCredentialAction(id);
      toast("کلید حذف شد");
      router.refresh();
    });

  const needsBaseUrl = form.provider === "openai-compatible";
  const needsAzure = form.provider === "azure";

  return (
    <div className="mt-6 space-y-5">
      {/* existing keys */}
      <div className="space-y-2.5">
        {credentials.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-card/40 p-6 text-center text-sm text-muted-foreground">
            هنوز کلیدی اضافه نکرده‌اید. در حالت آزمایشی (mock) همه‌چیز بدون کلید کار می‌کند.
          </div>
        )}
        {credentials.map((c) => (
          <div
            key={c.id}
            className={cn(
              "flex items-center gap-3 rounded-2xl border bg-card/60 p-3.5 transition-colors",
              c.isActive && "border-primary/50 bg-primary/5",
            )}
          >
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-xl",
                c.isActive ? "bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <KeyRound className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 truncate text-sm font-semibold">
                {c.label}
                {c.isActive && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <ShieldCheck className="size-3" /> فعال
                  </span>
                )}
              </p>
              <p className="truncate text-[11px] text-muted-foreground" dir="ltr">
                {providerLabel(c.provider)}
                {c.model ? ` · ${c.model}` : ""}
                {c.baseUrl ? ` · ${c.baseUrl}` : ""}
              </p>
            </div>
            {!c.isActive && (
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={pending} onClick={() => activate(c.id)}>
                <Check className="size-3.5" /> فعال‌سازی
              </Button>
            )}
            <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-risk-critical" disabled={pending} onClick={() => remove(c.id)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}

        {credentials.some((c) => c.isActive) && (
          <button
            onClick={() => activate(null)}
            disabled={pending}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            غیرفعال‌سازی همه و بازگشت به حالت آزمایشی
          </button>
        )}
      </div>

      {/* add new */}
      {open ? (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border bg-card/60 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" /> افزودن کلید جدید
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">نام دلخواه</span>
              <Input value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="مثلاً کلید کاری" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">ارائه‌دهنده</span>
              <select
                value={form.provider}
                onChange={(e) => set("provider", e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] text-muted-foreground">کلید API</span>
            <Input
              value={form.apiKey}
              onChange={(e) => set("apiKey", e.target.value)}
              placeholder={PROVIDERS.find((p) => p.value === form.provider)?.hint}
              dir="ltr"
              className="text-start font-mono"
              autoComplete="off"
            />
          </label>

          {needsAzure && (
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">نام منبع Azure (resource name)</span>
              <Input value={form.azureResource} onChange={(e) => set("azureResource", e.target.value)} dir="ltr" className="text-start" />
            </label>
          )}
          {needsBaseUrl && (
            <label className="block space-y-1">
              <span className="text-[11px] text-muted-foreground">Base URL</span>
              <Input value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} placeholder="https://your-gateway/v1" dir="ltr" className="text-start" />
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">مدل اصلی (اختیاری)</span>
              <Input value={form.model} onChange={(e) => set("model", e.target.value)} dir="ltr" className="text-start" placeholder="پیش‌فرض هوشمند" />
            </label>
            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">مدل سریع (اختیاری)</span>
              <Input value={form.modelFast} onChange={(e) => set("modelFast", e.target.value)} dir="ltr" className="text-start" placeholder="پیش‌فرض هوشمند" />
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" className="gap-1.5" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              افزودن و فعال‌سازی
            </Button>
            {credentials.length > 0 && (
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                انصراف
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">
            🔒 کلید شما رمزنگاری‌شده (AES-256-GCM) ذخیره می‌شود و هرگز به‌صورت متن آشکار نمایش داده نمی‌شود.
          </p>
        </form>
      ) : (
        <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> افزودن کلید دیگر
        </Button>
      )}
    </div>
  );
}

function providerLabel(p: string): string {
  return PROVIDERS.find((x) => x.value === p)?.label ?? p;
}
