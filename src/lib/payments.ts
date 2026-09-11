/**
 * Online payment provider layer (guest portal).
 *
 * Everything sensitive stays on the server: the browser only asks whether a
 * provider is configured and, when the guest presses Pay, receives a PayPal
 * approval URL generated server-side from a server-authoritative amount.
 *
 * The owner adds these secrets in Project Settings -> Secrets:
 *   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENVIRONMENT=sandbox
 * Until then every endpoint reports "not configured" and the portal keeps the
 * existing "ask reception" behaviour.
 */

export type PaymentProvider = "cmi" | "paypal";

export type PaymentConfig =
  | { available: false }
  | { available: true; provider: PaymentProvider; environment: string | null };

/** Server-checked provider availability. Never exposes any credential. */
export function paymentStatusQuery() {
  return {
    queryKey: ["payment-status"],
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<PaymentConfig> => {
      try {
        const res = await fetch("/api/public/paypal/status", { headers: { Accept: "application/json" } });
        if (!res.ok) return { available: false };
        const json = (await res.json()) as {
          available?: boolean;
          provider?: PaymentProvider;
          environment?: string | null;
        };
        return json.available
          ? {
              available: true,
              provider: json.provider ?? "paypal",
              environment: json.environment ?? null,
            }
          : { available: false };
      } catch {
        return { available: false };
      }
    },
  };
}

/**
 * Asks the server to create a PayPal order for the stay's outstanding MAD
 * balance and returns the approval URL the guest must be redirected to.
 * Throws a stable error code the UI translates.
 */
export async function startCheckout(token: string): Promise<string> {
  const res = await fetch("/api/public/paypal/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const json = (await res.json().catch(() => ({}))) as { approveUrl?: string; error?: string };
  if (!res.ok || !json.approveUrl) throw new Error(json.error ?? "PAYMENT_FAILED");
  return json.approveUrl;
}
