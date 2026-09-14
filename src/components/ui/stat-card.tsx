import { forwardRef, type MouseEventHandler, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "primary" | "warning" | "success";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  icon?: ReactNode;
  expanded?: boolean;
  controls?: string;
};

export const StatCard = forwardRef<HTMLButtonElement, StatCardProps>(function StatCard(
  { label, value, hint, tone = "default", onClick, icon, expanded, controls },
  ref,
) {
  const toneClass = {
    default: "text-foreground",
    primary: "text-primary",
    warning: "text-warning-foreground",
    success: "text-success",
  }[tone];

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-haspopup={onClick ? "dialog" : undefined}
      aria-expanded={onClick ? expanded : undefined}
      aria-controls={onClick ? controls : undefined}
      className={cn(
        "surface-card relative flex w-full flex-col items-start gap-1 p-4 text-start transition-transform",
        onClick &&
          "cursor-pointer pe-9 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
    </button>
  );
});
