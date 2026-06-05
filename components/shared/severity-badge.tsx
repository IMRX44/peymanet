import { Badge } from "@/components/ui/badge";
import { SEVERITY_LABELS } from "@/lib/constants";
import { SEVERITY_HEX, SEVERITY_BORDER_CLASS, SEVERITY_TEXT_CLASS } from "@/lib/risk/colors";
import { pickBilingual } from "@/lib/i18n/localize";
import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/ai/schemas";

export function SeverityBadge({ severity, locale, className }: { severity: Severity; locale: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5", SEVERITY_BORDER_CLASS[severity], className)}>
      <span className="size-1.5 rounded-full" style={{ background: SEVERITY_HEX[severity] }} />
      <span className={SEVERITY_TEXT_CLASS[severity]}>{pickBilingual(SEVERITY_LABELS[severity], locale)}</span>
    </Badge>
  );
}
