"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Sparkles,
  Send,
  Loader2,
  Check,
  X,
  Wand2,
  Plus,
  ShieldAlert,
  MessageCircle,
  MessagesSquare,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DiffViewer } from "@/components/timeline/diff-viewer";
import { assistantAction, logRejectionAction } from "@/app/actions";
import { wordDiff } from "@/lib/diff/textDiff";
import { cn } from "@/lib/utils";
import type { AssistantResponse } from "@/lib/ai/schemas";

type Proposal =
  | { type: "edit"; find: string; replacement: string; summary: string }
  | { type: "insert"; clause: string; summary: string };

type Msg = {
  role: "user" | "assistant";
  text: string;
  kind?: AssistantResponse["kind"];
  proposal?: Proposal | null;
  findings?: { clause: string; risk: string; remediation: string }[] | null;
  resolved?: "accepted" | "rejected" | null;
};

type Chat = { id: string; title: string; messages: Msg[]; costUsd: number };

const newChat = (): Chat => ({ id: Math.random().toString(36).slice(2), title: "گفت‌وگوی جدید", messages: [], costUsd: 0 });

function fmtCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

export function DocumentAssistant({
  contractId,
  locale,
  document,
  mode,
  onApplyEdit,
  onApplyInsert,
  onHighlight,
}: {
  contractId: string;
  locale: string;
  document: string;
  mode: "suggest" | "auto";
  onApplyEdit: (find: string, replacement: string, summary: string) => void;
  onApplyInsert: (clause: string, summary: string) => void;
  onHighlight: (phrase: string) => void;
}) {
  const t = useTranslations("editor");
  const [chats, setChats] = useState<Chat[]>([newChat()]);
  const [activeId, setActiveId] = useState<string>(() => chats[0].id);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = chats.find((c) => c.id === activeId) ?? chats[0];
  const messages = active.messages;

  // Patch a specific chat by id so async replies always land in the right chat,
  // even if the user switched chats while a request was in flight.
  const patchChat = (chatId: string, fn: (c: Chat) => Chat) =>
    setChats((all) => all.map((c) => (c.id === chatId ? fn(c) : c)));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const startNewChat = () => {
    const c = newChat();
    setChats((all) => [...all, c]);
    setActiveId(c.id);
    setInput("");
  };

  // `priorHistory` is the ordered transcript BEFORE this turn's question, so the
  // model receives messages in the correct chronological order (oldest→newest).
  const runAssistant = async (chatId: string, q: string, priorHistory: { role: "user" | "assistant"; content: string }[]) => {
    try {
      const history = priorHistory.slice(-6);
      const res = await assistantAction({ contractId, document, message: q, history });
      if (!res.ok) {
        toast.error(res.error ?? "درخواست دستیار ناموفق بود");
        return;
      }
      const r = res.response;
      const pick = (b: { fa: string; en: string }) => (locale === "en" ? b.en : b.fa);
      const msg: Msg = { role: "assistant", text: pick(r.message), kind: r.kind, resolved: null };

      if (r.highlight) onHighlight(r.highlight);
      if (r.kind === "review" && r.findings) {
        msg.findings = r.findings.map((f) => ({ clause: f.clause, risk: pick(f.risk), remediation: pick(f.remediation) }));
      }
      let autoApply: (() => void) | null = null;
      if (r.kind === "edit" && r.edit) {
        const proposal: Proposal = { type: "edit", find: r.edit.find, replacement: r.edit.replacement, summary: r.summary ? pick(r.summary) : msg.text };
        if (mode === "auto") {
          autoApply = () => onApplyEdit(proposal.find, proposal.replacement, proposal.summary);
          msg.resolved = "accepted";
        } else msg.proposal = proposal;
      }
      if (r.kind === "insert" && r.insert) {
        const proposal: Proposal = { type: "insert", clause: r.insert.clause, summary: r.summary ? pick(r.summary) : msg.text };
        if (mode === "auto") {
          autoApply = () => onApplyInsert(proposal.clause, proposal.summary);
          msg.resolved = "accepted";
        } else msg.proposal = proposal;
      }
      patchChat(chatId, (c) => ({ ...c, messages: [...c.messages, msg], costUsd: c.costUsd + (res.costUsd ?? 0) }));
      autoApply?.();
    } catch {
      toast.error("درخواست دستیار ناموفق بود");
    }
  };

  const send = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    const chatId = active.id;
    // Snapshot the prior transcript in order, then append the user's question.
    const priorHistory = active.messages.map((m) => ({ role: m.role, content: m.text }));
    patchChat(chatId, (c) => ({
      ...c,
      title: c.messages.length === 0 ? q.slice(0, 40) : c.title,
      messages: [...c.messages, { role: "user", text: q }],
    }));
    setInput("");
    start(() => {
      void runAssistant(chatId, q, priorHistory);
    });
  };

  const resolve = (idx: number, accept: boolean) => {
    const msg = messages[idx];
    if (!msg?.proposal) return;

    if (accept) {
      if (msg.proposal.type === "edit") onApplyEdit(msg.proposal.find, msg.proposal.replacement, msg.proposal.summary);
      else onApplyInsert(msg.proposal.clause, msg.proposal.summary);
    } else {
      void logRejectionAction(contractId, msg.proposal.summary);
      toast("پیشنهاد رد شد");
    }

    patchChat(activeId, (c) => {
      const next = [...c.messages];
      if (!next[idx]?.proposal) return c;
      next[idx] = { ...next[idx], resolved: accept ? "accepted" : "rejected" };
      return { ...c, messages: next };
    });
  };

  const suggestions = [
    { icon: ShieldAlert, label: t("qReview"), q: "این قرارداد را از نظر ریسک‌های حقوقی بر اساس قوانین جمهوری اسلامی ایران بررسی کن." },
    { icon: Wand2, label: t("qMutual"), q: "بند فسخ را متقابل و متوازن کن." },
    { icon: Plus, label: t("qLiability"), q: "یک بند محدودیت مسئولیت اضافه کن." },
    { icon: MessageCircle, label: t("qNonSolicit"), q: "آیا این قرارداد بند عدم جذب دارد؟" },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Assistant header + chat switcher */}
      <div className="flex items-center gap-2 border-b bg-card/50 px-3 py-2.5 backdrop-blur">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground">
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{t("assistantTitle")}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            هزینهٔ این گفت‌وگو: {fmtCost(active.costUsd)}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-8 gap-1 px-2">
              <MessagesSquare className="size-3.5" />
              <span className="text-xs">{chats.length > 1 ? `${chats.length}` : ""}</span>
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {chats.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn("flex items-center justify-between gap-2", c.id === activeId && "bg-accent")}
              >
                <span className="line-clamp-1 flex-1 text-xs">{c.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{fmtCost(c.costUsd)}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={startNewChat} title="گفت‌وگوی جدید">
          <Plus className="size-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto scrollbar-thin p-4">
        {messages.length === 0 && (
          <div className="space-y-3 pt-4">
            <p className="text-center text-xs text-muted-foreground">{t("assistantEmpty")}</p>
            <div className="grid gap-2">
              {suggestions.map((s) => (
                <button
                  key={s.label}
                  onClick={() => send(s.q)}
                  className="flex items-center gap-2 rounded-lg border bg-card/60 px-3 py-2 text-start text-xs transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <s.icon className="size-3.5 text-primary" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3 py-2 text-xs leading-6",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "border bg-card",
                  )}
                >
                  {m.text}
                </div>
              </div>

              {/* findings (review) */}
              {m.findings && m.findings.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.findings.map((f, k) => (
                    <div key={k} className="rounded-lg border bg-muted/30 p-2 text-[11px] leading-5">
                      <p className="line-clamp-1 font-medium text-foreground/80">{f.clause}</p>
                      <p className="mt-0.5 text-risk-high">⚠ {f.risk}</p>
                      <p className="mt-0.5 text-risk-safe">✓ {f.remediation}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* proposal (edit/insert) */}
              {m.proposal && (
                <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5">
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                    {m.proposal.type === "edit" ? <Wand2 className="size-3" /> : <Plus className="size-3" />}
                    {m.proposal.summary}
                  </p>
                  {m.proposal.type === "edit" ? (
                    <DiffViewer segments={wordDiff(m.proposal.find, m.proposal.replacement).segments} className="max-h-40 overflow-y-auto text-[11px]" />
                  ) : (
                    <pre dir="auto" className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-risk-safe/10 p-2 text-[11px] leading-5 text-risk-safe">
                      {m.proposal.clause.trim()}
                    </pre>
                  )}
                  {m.resolved == null ? (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" className="h-7 flex-1 gap-1 text-xs" onClick={() => resolve(i, true)}>
                        <Check className="size-3" />
                        {t("accept")}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-xs" onClick={() => resolve(i, false)}>
                        <X className="size-3" />
                        {t("reject")}
                      </Button>
                    </div>
                  ) : (
                    <Badge
                      variant="muted"
                      className={cn("mt-2 w-full justify-center", m.resolved === "accepted" ? "text-risk-safe" : "text-muted-foreground")}
                    >
                      {m.resolved === "accepted" ? t("applied") : t("rejected")}
                    </Badge>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border bg-card px-3 py-2">
              <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t bg-card/50 p-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              send(input);
            }}
            placeholder={t("assistantPlaceholder")}
          />
          <Button size="icon" onClick={() => send(input)} disabled={pending || !input.trim()}>
            <Send className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}
