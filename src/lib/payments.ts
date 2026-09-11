/**
 * Online payment provider abstraction.
 *
 * Morocco-friendly providers (CMI, PayPal) are configured through build-time
 * env values. No provider credentials exist today, so the portal must never
 * claim a payment succeeded nor create a payment record from the browser.
 *
 * When a provider is connected later, a server function should create the
 * checkout session with a SERVER-authoritative amount in MAD and return its
 * URL through `createCheckout`; the guest portal UI does not need to change.
 */

export type PaymentProvider = "cmi" | "paypal";

export type PaymentConfig =
  | { available: false }
  | { available: true; provider: PaymentProvider };

function readProvider(): PaymentProvider | null {
  const raw = (import.meta.env['VITE_PAYMENT_PROVIDER'] as string | undefined)?.trim().toLowerCase();
  if (raw === "cmi" || raw === "paypal") return raw;
  return null;
}

export function paymentConfig(): PaymentConfig {
  const provider = readProvider();
  return provider ? { available: true, provider } : { available: false };
}

/**
 * Placeholder for the future server-generated checkout URL. Intentionally
 * throws while no provider is configured: nothing client-side may ever mark a
 * bill as paid. Card data is never handled or stored by this app.
 */
export async function createCheckout(_token: string): Promise<string> {
  throw new Error("PAYMENT_NOT_CONFIGURED");
}
