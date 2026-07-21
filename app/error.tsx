"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Global error boundary — replaces Next's raw error screen with a Persian, styled page. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app error boundary]", error);
  }, [error]);

  return (
    <main className="mesh-bg grid min-h-screen place-items-center px-4">
      <div className="glass w-full max-w-md rounded-3xl border p-8 text-center shadow-2xl">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-risk-critical/15 text-risk-critical">
          <TriangleAlert className="size-7" />
        </span>
        <h1 className="text-xl font-bold">خطایی رخ داد</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          مشکلی در پردازش درخواست پیش آمد. دوباره تلاش کنید؛ اگر مشکل ادامه داشت، صفحه را تازه‌سازی کنید.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[10px] text-muted-foreground/70" dir="ltr">
            {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button onClick={reset} className="gap-1.5">
            <RotateCcw className="size-4" />
            تلاش مجدد
          </Button>
          <Button asChild variant="outline" className="gap-1.5">
            <Link href="/contracts">
              <Home className="size-4" />
              قراردادها
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
