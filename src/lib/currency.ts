/**
 * Display-currency layer.
 *
 * MAD is the ONLY stored/base/accounting currency. Every amount in the
 * database, every input field and every calculation stays in MAD. This module
 * only converts amounts for *display*, so the owner can eyeball figures in a
 * familiar currency.
 */

export type Currency = "MAD" | "EUR" | "USD" | "GBP";

export const CURRENCIES: { code: Currency; symbol: string; label: string }[] = [
  { code: "MAD", symbol: "DH", label: "DH" },
  { code: "EUR", symbol: "€", label: "€" },
  { code: "USD", symbol: "$", label: "$" },
  { code: "GBP", symbol: "£", label: "£" },
];

/**
 * Provisional DISPLAY-ONLY rates, expressed as 1 MAD -> target currency.
 * These are NOT accounting rates and are not fetched from any third party in
 * V1; converted values are always marked approximate in the UI.
 */
export const DISPLAY_RATES: Record<Currency, number> = {
  MAD: 1,
  EUR: 0.092,
  USD: 0.108,
  GBP: 0.08,
};

const STORAGE_KEY = "caiat.currency";
const listeners = new Set<() => void>();

let currentCurrency: Currency = "MAD";

function isCurrency(value: unknown): value is Currency {
  return value === "MAD" || value === "EUR" || value === "USD" || value === "GBP";
}

export function getCurrency(): Currency {
  return currentCurrency;
}

export function storedCurrency(): Currency | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isCurrency(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function setCurrency(next: Currency) {
  currentCurrency = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode: preference simply is not persisted */
    }
  }
  listeners.forEach((fn) => fn());
}

export function subscribeCurrency(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function currencySymbol(code: Currency = currentCurrency): string {
  return CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

/** Base (MAD) amount rendered as "450 DH" — never converted. */
export function formatBase(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} DH`;
}

/**
 * Format a stored MAD amount in the active display currency.
 * Non-MAD output is prefixed with "≈" because the rate is provisional.
 */
export function formatDisplay(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  const code = currentCurrency;
  if (code === "MAD") return formatBase(n);
  const converted = n * DISPLAY_RATES[code];
  const amount = converted.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `≈ ${currencySymbol(code)}${amount}`;
}
