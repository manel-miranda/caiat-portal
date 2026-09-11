import { Coins } from "lucide-react";
import { CURRENCIES, useCurrency, type Currency } from "@/lib/currency";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Compact display-currency picker. Display only: stored amounts stay in MAD.
 */
export function CurrencySwitcher({ className }: { className?: string }) {
  const { currency, setCurrency } = useCurrency();

  return (
    <label
      className={cn(
        "relative flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm font-medium text-muted-foreground",
        className,
      )}
      title={t("currencyApproxNote")}
    >
      <Coins className="size-4 shrink-0" aria-hidden />
      <select
        aria-label={t("currency")}
        value={currency}
        onChange={(e) => setCurrency(e.target.value as Currency)}
        className="cursor-pointer appearance-none bg-transparent pe-1 text-sm font-medium text-foreground outline-none"
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.symbol}
          </option>
        ))}
      </select>
    </label>
  );
}
