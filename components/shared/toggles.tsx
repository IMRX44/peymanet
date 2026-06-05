"use client";

import { useTransition } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Languages } from "lucide-react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { setLocaleAction } from "@/app/actions";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="block size-4 dark:hidden" />
    </Button>
  );
}

export function LocaleToggle() {
  const locale = useLocale();
  const [pending, start] = useTransition();
  const next = locale === "fa" ? "en" : "fa";
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="gap-1.5"
      onClick={() => start(() => void setLocaleAction(next))}
    >
      <Languages className="size-4" />
      <span className="text-xs font-medium">{next === "en" ? "EN" : "فا"}</span>
    </Button>
  );
}
