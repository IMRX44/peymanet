"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, ArrowLeft, Plus, Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createContractAction, deleteContractAction } from "@/app/actions";
import { CONTRACT_TYPE_LABELS, statusLabel } from "@/lib/constants";
import { scoreToSeverity, SEVERITY_HEX } from "@/lib/risk/colors";
import { toPersianDigits } from "@/lib/utils";
import { CONTRACT_TYPES, type ContractType } from "@/lib/ai/schemas";

type ContractRow = {
  id: string;
  title: string;
  type: string;
  status: string;
  overallRisk: number | null;
  updatedAt: string;
};

export function ContractsGrid({ contracts }: { contracts: ContractRow[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("employment");
  const [pending, start] = useTransition();

  const create = () =>
    start(async () => {
      const res = await createContractAction({ title: title.trim(), type });
      if (res.ok) {
        toast.success("قرارداد جدید ایجاد شد");
        setCreateOpen(false);
        setTitle("");
        router.push(`/contracts/${res.contractId}/edit`);
      } else {
        toast.error(res.error ?? "ایجاد قرارداد ناموفق بود");
      }
    });

  const remove = (id: string) =>
    start(async () => {
      const res = await deleteContractAction(id);
      if (res.ok) {
        toast.success("قرارداد حذف شد");
        setDeleteId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "حذف قرارداد ناموفق بود");
      }
    });

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {toPersianDigits(contracts.length)} قرارداد
        </p>
        <Button className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          قرارداد جدید
        </Button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {contracts.map((c) => {
          const risk = c.overallRisk ?? 0;
          const color = SEVERITY_HEX[scoreToSeverity(risk)];
          return (
            <Card key={c.id} className="group relative h-full p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg">
              <button
                type="button"
                aria-label="حذف قرارداد"
                onClick={() => setDeleteId(c.id)}
                className="absolute left-3 top-3 z-10 grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-risk-critical/10 hover:text-risk-critical group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
              <Link href={`/contracts/${c.id}/edit`} className="block">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid size-9 place-items-center rounded-lg bg-muted">
                      <FileText className="size-4 text-muted-foreground" />
                    </span>
                    <div>
                      <h3 className="font-semibold leading-snug group-hover:text-primary">{c.title}</h3>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge variant="muted">{CONTRACT_TYPE_LABELS[c.type as ContractType]?.fa ?? c.type}</Badge>
                        <span className="text-xs text-muted-foreground">{statusLabel(c.status)}</span>
                      </div>
                    </div>
                  </div>
                  {c.overallRisk != null && (
                    <div className="flex flex-col items-center">
                      <span className="text-lg font-bold tabular-nums" style={{ color }}>
                        {toPersianDigits(risk)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">ریسک کلی</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-end text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  باز کردن
                  <ArrowLeft className="ms-1 size-3" />
                </div>
              </Link>
            </Card>
          );
        })}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>قرارداد جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">عنوان قرارداد</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثلاً: قرارداد خدمات مشاوره"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && title.trim()) create();
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">نوع قرارداد</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((ct) => (
                    <SelectItem key={ct} value={ct}>
                      {CONTRACT_TYPE_LABELS[ct].fa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={pending}>
              انصراف
            </Button>
            <Button onClick={create} disabled={pending || !title.trim()} className="gap-1.5">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              ایجاد قرارداد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-risk-critical">حذف قرارداد</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            آیا از حذف این قرارداد مطمئن هستید؟ این عمل تمام نسخه‌ها، تحلیل‌ها و تاریخچهٔ آن را برای همیشه حذف می‌کند و قابل بازگشت نیست.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={pending}>
              انصراف
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && remove(deleteId)}
              disabled={pending}
              className="gap-1.5"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              حذف قطعی
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
