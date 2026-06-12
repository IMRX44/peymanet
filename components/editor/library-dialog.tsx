"use client";

import { useState } from "react";
import { FileText, Plus, Library as LibraryIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LIBRARY_CLAUSES, LIBRARY_TEMPLATES } from "@/lib/library";

export function LibraryDialog({
  open,
  onOpenChange,
  onInsertClause,
  onLoadTemplate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onInsertClause: (body: string) => void;
  onLoadTemplate: (content: string) => void;
}) {
  const [confirmTemplate, setConfirmTemplate] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LibraryIcon className="size-5 text-primary" />
            کتابخانه
          </DialogTitle>
        </DialogHeader>
        <Tabs dir="rtl" defaultValue="clauses">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="clauses">بندهای آماده</TabsTrigger>
            <TabsTrigger value="templates">قراردادهای پیش‌فرض</TabsTrigger>
          </TabsList>

          <TabsContent value="clauses" className="mt-3">
            <div className="grid max-h-[55vh] gap-2 overflow-y-auto scrollbar-thin pe-1 sm:grid-cols-2">
              {LIBRARY_CLAUSES.map((c) => (
                <div key={c.id} className="flex flex-col rounded-lg border bg-card/50 p-3">
                  <p className="text-sm font-semibold">{c.title}</p>
                  <p className="mt-1 line-clamp-3 flex-1 text-[11px] leading-5 text-muted-foreground">{c.body}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 gap-1.5"
                    onClick={() => onInsertClause(c.body)}
                  >
                    <Plus className="size-3.5" />
                    درج در سند
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="templates" className="mt-3">
            <div className="grid max-h-[55vh] gap-2 overflow-y-auto scrollbar-thin pe-1">
              {LIBRARY_TEMPLATES.map((tpl) => (
                <div key={tpl.id} className="flex items-center gap-3 rounded-lg border bg-card/50 p-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                    <FileText className="size-4 text-muted-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{tpl.title}</p>
                      <Badge variant="muted" className="text-[9px]">
                        {tpl.description}
                      </Badge>
                    </div>
                  </div>
                  {confirmTemplate === tpl.id ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs"
                        onClick={() => {
                          onLoadTemplate(tpl.content);
                          setConfirmTemplate(null);
                          onOpenChange(false);
                        }}
                      >
                        جایگزینی
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmTemplate(null)}>
                        انصراف
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1.5 text-xs" onClick={() => setConfirmTemplate(tpl.id)}>
                      بارگذاری
                    </Button>
                  )}
                </div>
              ))}
              <p className="px-1 pt-1 text-[11px] text-muted-foreground">
                توجه: بارگذاری یک قرارداد پیش‌فرض، محتوای فعلی سند را جایگزین می‌کند.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
