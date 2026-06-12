"use client";

import { useMemo } from "react";
import { GripVertical, ChevronUp, ChevronDown, Trash2, Blocks } from "lucide-react";
import { cn, toPersianDigits } from "@/lib/utils";

/** Split a markdown document into clause "blocks" separated by blank lines. */
function splitBlocks(content: string): string[] {
  return content.split(/\n{2,}/).map((b) => b.replace(/\s+$/, "")).filter((b) => b.trim().length > 0);
}

function joinBlocks(blocks: string[]): string {
  return blocks.join("\n\n");
}

function blockTitle(block: string): string {
  const first = block.split("\n").find((l) => l.trim().length > 0) ?? "";
  return first.replace(/^#+\s*/, "").trim().slice(0, 48) || "بند بدون عنوان";
}

export function BlocksOutline({
  content,
  onChange,
  onFocusBlock,
}: {
  content: string;
  onChange: (next: string) => void;
  onFocusBlock?: (firstLine: string) => void;
}) {
  const blocks = useMemo(() => splitBlocks(content), [content]);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...blocks];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(joinBlocks(next));
  };

  const remove = (idx: number) => {
    const next = blocks.filter((_, i) => i !== idx);
    onChange(joinBlocks(next));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b bg-card/40 px-3 py-2">
        <Blocks className="size-4 text-primary" />
        <p className="text-xs font-semibold">بندها</p>
        <span className="ms-auto text-[10px] text-muted-foreground">{toPersianDigits(blocks.length)} بلوک</span>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto scrollbar-thin p-2">
        {blocks.map((b, i) => (
          <div
            key={i}
            className="group flex items-center gap-1 rounded-lg border bg-card/50 px-2 py-1.5 transition-colors hover:border-primary/40"
          >
            <GripVertical className="size-3.5 shrink-0 text-muted-foreground/40" />
            <button
              type="button"
              onClick={() => onFocusBlock?.(b.split("\n").find((l) => l.trim()) ?? "")}
              className="line-clamp-1 flex-1 text-start text-[11px] text-foreground/80"
              title={blockTitle(b)}
            >
              <span className="me-1 inline-grid size-4 place-items-center rounded bg-muted text-[9px] font-bold text-muted-foreground">
                {toPersianDigits(i + 1)}
              </span>
              {blockTitle(b)}
            </button>
            <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                className={cn("grid size-6 place-items-center rounded hover:bg-muted", i === 0 && "opacity-30")}
                title="انتقال به بالا"
              >
                <ChevronUp className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === blocks.length - 1}
                className={cn("grid size-6 place-items-center rounded hover:bg-muted", i === blocks.length - 1 && "opacity-30")}
                title="انتقال به پایین"
              >
                <ChevronDown className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(i)}
                className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-risk-critical/10 hover:text-risk-critical"
                title="حذف بند"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
        {blocks.length === 0 && <p className="p-2 text-center text-[11px] text-muted-foreground">سند خالی است.</p>}
      </div>
    </div>
  );
}
