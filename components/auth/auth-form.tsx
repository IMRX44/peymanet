"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scale, Mail, Lock, User, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInAction, signUpAction } from "@/app/actions";
import { cn } from "@/lib/utils";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res =
        mode === "signup"
          ? await signUpAction({ email, password, name })
          : await signInAction({ email, password });
      if (!res.ok) {
        toast.error(res.error ?? "خطایی رخ داد");
        return;
      }
      toast.success(mode === "signup" ? "حساب ساخته شد ✨" : "خوش آمدید!");
      router.replace("/contracts");
      router.refresh();
    });
  };

  return (
    <main className="mesh-bg relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-24 start-1/2 size-[480px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="glass relative w-full max-w-sm rounded-3xl border p-7 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-lg shadow-primary/30">
            <Scale className="size-6" />
          </span>
          <h1 className="text-xl font-bold">پیمانت</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {mode === "signin" ? "به حساب خود وارد شوید" : "حساب کاربری بسازید"}
          </p>
        </div>

        {/* mode switch */}
        <div className="mb-5 flex rounded-xl bg-muted p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors",
                mode === m ? "bg-background shadow" : "text-muted-foreground",
              )}
            >
              {m === "signin" ? "ورود" : "ثبت‌نام"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <Field icon={User}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="نام شما"
                className="border-0 bg-transparent ps-9 shadow-none focus-visible:ring-0"
              />
            </Field>
          )}
          <Field icon={Mail}>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ایمیل"
              dir="ltr"
              className="border-0 bg-transparent ps-9 text-start shadow-none focus-visible:ring-0"
            />
          </Field>
          <Field icon={Lock}>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="رمز عبور"
              dir="ltr"
              className="border-0 bg-transparent ps-9 text-start shadow-none focus-visible:ring-0"
            />
          </Field>

          <Button type="submit" className="w-full gap-2 shadow-lg shadow-primary/20" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowLeft className="size-4 rtl:rotate-180" />}
            {mode === "signin" ? "ورود" : "ساخت حساب"}
          </Button>
        </form>

        <p className="mt-5 text-center text-[11px] leading-5 text-muted-foreground">
          با ورود، می‌توانید قرارداد بسازید، ویرایش کنید و کلید هوش مصنوعی خودتان را اضافه کنید.
        </p>
      </div>
    </main>
  );
}

function Field({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="relative flex items-center rounded-xl border bg-card/60">
      <Icon className="pointer-events-none absolute start-3 size-4 text-muted-foreground" />
      {children}
    </div>
  );
}
