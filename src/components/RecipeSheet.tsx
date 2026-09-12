/**
 * Admin recipe editor for a catalogue dish.
 *
 * Average ingredient quantities per portion, used only to estimate stock when a
 * PREVIEW food order is delivered. Kept in its own sheet so the catalogue edit
 * dialog stays usable on a phone.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { t } from "@/lib/i18n";
import {
  inventoryErrorKey,
  inventoryStatusQuery,
  recipeComponentsQuery,
  saveRecipe,
} from "@/lib/inventory";

type Row = { inventory_item_id: string; qty: string };

export function RecipeSheet({
  serviceTypeId,
  serviceLabel,
  onClose,
}: {
  serviceTypeId: string | null;
  serviceLabel: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const items = useQuery(inventoryStatusQuery);
  const recipes = useQuery(recipeComponentsQuery);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!serviceTypeId) return;
    setRows(
      (recipes.data ?? [])
        .filter((r) => r.service_type_id === serviceTypeId)
        .map((r) => ({ inventory_item_id: r.inventory_item_id, qty: String(r.qty_per_portion) })),
    );
  }, [serviceTypeId, recipes.data]);

  const options = (items.data ?? []).filter((i) => i.active);

  async function save() {
    if (!serviceTypeId) return;
    const components = rows
      .filter((r) => r.inventory_item_id && Number(r.qty) > 0)
      .map((r) => ({ inventory_item_id: r.inventory_item_id, qty_per_portion: Number(r.qty) }));
    setBusy(true);
    try {
      await saveRecipe(serviceTypeId, components);
      await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(t("recipeSaved"));
      onClose();
    } catch (e) {
      const key = inventoryErrorKey((e as Error).message);
      toast.error(key ? t(key as never) : (e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Sheet open={Boolean(serviceTypeId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-start">
          <SheetTitle className="text-base">
            {t("recipeTitle")} · {serviceLabel}
          </SheetTitle>
        </SheetHeader>
        <p className="mt-1 text-xs text-muted-foreground">{t("recipeHint")}</p>

        <div className="mt-3 grid gap-2 pb-6">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("recipeNone")}</p>
          ) : null}
          {rows.map((row, index) => {
            const unit = options.find((o) => o.id === row.inventory_item_id)?.unit ?? "";
            return (
              <div key={index} className="flex items-center gap-2">
                <select
                  aria-label={t("stockItems")}
                  value={row.inventory_item_id}
                  onChange={(e) =>
                    setRows(
                      rows.map((r, i) =>
                        i === index ? { ...r, inventory_item_id: e.target.value } : r,
                      ),
                    )
                  }
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-2 text-sm"
                >
                  <option value="">—</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Input
                  inputMode="decimal"
                  className="w-24"
                  aria-label={t("recipeQtyPerPortion")}
                  value={row.qty}
                  onChange={(e) =>
                    setRows(rows.map((r, i) => (i === index ? { ...r, qty: e.target.value } : r)))
                  }
                />
                <span className="w-10 shrink-0 text-xs text-muted-foreground">{unit}</span>
                <button
                  aria-label="Remove"
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}

          <Button
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => setRows([...rows, { inventory_item_id: "", qty: "" }])}
          >
            +
          </Button>
          <Button className="w-full rounded-xl" disabled={busy} onClick={() => void save()}>
            {t("save")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
