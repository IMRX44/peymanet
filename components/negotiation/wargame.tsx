"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Swords, Send, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { wargameAction } from "@/app/actions";
import { PERSPECTIVE_LABELS } from "@/lib/constants";
import { pickBilingual } from "@/lib/i18n/localize";
import { cn } from "@/lib/utils";
import type { Perspective } from "@/lib/ai/schemas";

type Msg = { role: "user" | "assistant"; content: string };

export function Wargame({ contractId, perspective, locale }: { contractId: string; perspective: Perspective; locale: string }) {
  const t = useTranslations("negotiation");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const send = () => {
    const text = input.trim();
    if (!text || pending) return;
    const history = [...messages, { role: "user" as const, content: text }];
    setMessages(history);
    setInput("");
    start(() => {
      void (async () => {
        try {
          const res = await wargameAction({ contractId, perspective, history });
          if (res.ok) setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
          else toast.error(res.error ?? (locale === "en" ? "War-game request failed" : "درخواست جنگ‌افزار ناموفق بود"));
        } catch {
          toast.error(locale === "en" ? "War-game request failed" : "درخواست جنگ‌افزار ناموفق بود");
        }
      })();
    });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Swords className="size-4 text-risk-high" />
          {t("wargame")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={scrollRef} className="mb-2 max-h-56 space-y-2 overflow-y-auto scrollbar-thin">
          {messages.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {locale === "en"
                ? `The AI plays the ${pickBilingual(PERSPECTIVE_LABELS[perspective === "employee" ? "employer" : "employee"], "en")}. Make your opening move.`
                : "هوش مصنوعی نقش طرف مقابل را بازی می‌کند. اولین پیشنهاد خود را بنویسید."}
            </p>
          )}
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-3 py-1.5 text-xs leading-6",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {m.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {pending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-muted px-3 py-2">
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              send();
            }}
            placeholder={t("wargamePlaceholder")}
          />
          <Button size="icon" onClick={() => send()} disabled={pending || !input.trim()}>
            <Send className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
