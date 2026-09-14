import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  onClick,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "primary" | "warning" | "success";
  onClick?: () => void;
  icon?: ReactNode;
}) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    warning: "text-warning-foreground",
    success: "text-success",
  }[tone];

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={!onClick}
      aria-label={onClick ? label : undefined}
      className={cn(
        "surface-card relative h-auto min-h-28 w-full flex-col items-start gap-1 whitespace-normal p-4 text-start shadow-none transition-transform",
        onClick && "pe-9 active:scale-[0.98]",
      )}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={cn("text-2xl font-semibold tracking-tight", toneClass)}>{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      {onClick ? (
        <ChevronRight className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70 rtl:rotate-180" />
      ) : null}
    </Button>
  );
}
