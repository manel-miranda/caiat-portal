import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { t } from "@/lib/i18n";

export function DashboardKpiSheet({
  open,
  onOpenChange,
  title,
  scope,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  scope: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-dvh w-[92vw] max-w-md flex-col gap-0 p-0 sm:w-full">
        <SheetHeader className="shrink-0 border-b border-border px-5 py-5 pe-12 text-start">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{scope}</SheetDescription>
          {description ? <p className="text-sm leading-5 text-muted-foreground">{description}</p> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <SheetFooter className="shrink-0 border-t border-border p-4">
          <SheetClose asChild>
            <Button variant="outline" className="w-full sm:w-auto">
              {t("close")}
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}