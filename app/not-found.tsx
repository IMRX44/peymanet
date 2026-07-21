import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Global 404 — shown for unknown routes and inaccessible contracts. */
export default function NotFound() {
  return (
    <main className="mesh-bg grid min-h-screen place-items-center px-4">
      <div className="glass w-full max-w-md rounded-3xl border p-8 text-center shadow-2xl">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <FileQuestion className="size-7" />
        </span>
        <h1 className="text-xl font-bold">صفحه پیدا نشد</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          صفحه یا قراردادی که دنبال آن بودید وجود ندارد، حذف شده، یا به آن دسترسی ندارید.
        </p>
        <div className="mt-6">
          <Button asChild className="gap-1.5">
            <Link href="/contracts">
              <Home className="size-4" />
              بازگشت به قراردادها
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
