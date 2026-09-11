/**
 * PayPal (Sandbox) REST Orders v2 helper — SERVER ONLY.
 *
 * SECRETS: the owner must add these three secrets in
 * Project Settings -> Secrets (they are never in the repo, never sent to the
 * browser and never logged):
 *   - PAYPAL_CLIENT_ID
 *   - PAYPAL_CLIENT_SECRET
 *   - PAYPAL_ENVIRONMENT   ("sandbox" or "live")
 *
 * While any of them is missing, `paypalConfig()` returns null and the guest
 * portal keeps its current "online payment is not configured yet" behaviour.
 */

export type PaypalConfig = {
  clientId: string;
  clientSecret: string;
  environment: "sandbox" | "live";
  apiBase: string;
};

/** Reads config at call time (env is injected per request, not at import). */
export function paypalConfig(): PaypalConfig | null {
  const clientId = process.env['PAYPAL_CLIENT_ID'];
  const clientSecret = process.env['PAYPAL_CLIENT_SECRET'];
  const environment = (process.env['PAYPAL_ENVIRONMENT'] ?? 'sandbox').toLowerCase();
  if (!clientId || !clientSecret) return null;
  const live = environment === 'live' || environment === 'production';
  return {
    clientId,
    clientSecret,
    environment: live ? 'live' : 'sandbox',
    apiBase: live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com',
  };
}

/**
 * DEMO conversion: MAD is the only accounting currency, but PayPal Sandbox
 * accounts cannot settle in MAD, so the demo charges EUR using the same
 * provisional rate the UI shows (see src/lib/currency.ts DISPLAY_RATES.EUR).
 * Both the MAD amount and the EUR amount + rate are persisted for audit.
 */
export const DEMO_EUR_RATE = 0.092;
export const CHARGE_CURRENCY = 'EUR';

export function madToCharge(amountMad: number): { amount: number; currency: string; rate: number } {
  const eur = Math.round(amountMad * DEMO_EUR_RATE * 100) / 100;
  return { amount: eur, currency: CHARGE_CURRENCY, rate: DEMO_EUR_RATE };
}

async function accessToken(cfg: PaypalConfig): Promise<string> {
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch(`${cfg.apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    // Never log the response body: it can echo credentials context.
    throw new Error(`PAYPAL_AUTH_FAILED_${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('PAYPAL_AUTH_FAILED');
  return json.access_token;
}

export type CreatedOrder = { orderId: string; approveUrl: string };

export async function createOrder(params: {
  cfg: PaypalConfig;
  amount: number;
  currency: string;
  /** Opaque internal payment-session id — never the guest access token. */
  referenceId: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<CreatedOrder> {
  const token = await accessToken(params.cfg);
  const res = await fetch(`${params.cfg.apiBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: params.referenceId,
          custom_id: params.referenceId,
          description: 'Caiat Lounge Refuge — stay balance',
          amount: { currency_code: params.currency, value: params.amount.toFixed(2) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            user_action: 'PAY_NOW',
            return_url: params.returnUrl,
            cancel_url: params.cancelUrl,
          },
        },
      },
    }),
  });
  const json = (await res.json()) as {
    id?: string;
    links?: { rel: string; href: string }[];
  };
  if (!res.ok || !json.id) throw new Error(`PAYPAL_ORDER_FAILED_${res.status}`);
  const approve = json.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve');
  if (!approve) throw new Error('PAYPAL_NO_APPROVE_LINK');
  return { orderId: json.id, approveUrl: approve.href };
}

export type CaptureResult = {
  status: string;
  captureId: string | null;
  amount: number | null;
  currency: string | null;
};

export async function captureOrder(cfg: PaypalConfig, orderId: string): Promise<CaptureResult> {
  const token = await accessToken(cfg);
  const res = await fetch(`${cfg.apiBase}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Safe to retry: PayPal de-duplicates on this key.
      'PayPal-Request-Id': `capture-${orderId}`,
    },
  });
  const json = (await res.json()) as {
    status?: string;
    purchase_units?: {
      payments?: {
        captures?: { id: string; status: string; amount: { currency_code: string; value: string } }[];
      };
    }[];
  };
  if (!res.ok) throw new Error(`PAYPAL_CAPTURE_FAILED_${res.status}`);
  const cap = json.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    status: cap?.status ?? json.status ?? 'UNKNOWN',
    captureId: cap?.id ?? null,
    amount: cap ? Number(cap.amount.value) : null,
    currency: cap?.amount.currency_code ?? null,
  };
}
