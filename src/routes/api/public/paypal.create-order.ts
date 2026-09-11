import { createFileRoute } from "@tanstack/react-router";

/**
 * Guest-facing endpoint: creates a PayPal Sandbox order for the outstanding
 * balance of the stay behind a guest access token.
 *
 * Security: the guest token is validated server-side, the amount is taken from
 * the database (never from the browser), and the token itself is never sent to
 * PayPal — only an opaque payment-session id is.
 *
 * Requires the secrets PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET /
 * PAYPAL_ENVIRONMENT (Project Settings -> Secrets).
 */
export const Route = createFileRoute("/api/public/paypal/create-order")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const json = (msg: Record<string, unknown>, status = 200) =>
          new Response(JSON.stringify(msg), {
            status,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });

        let token = "";
        try {
          const body = (await request.json()) as { token?: unknown };
          token = typeof body.token === "string" ? body.token.trim() : "";
        } catch {
          return json({ error: "BAD_REQUEST" }, 400);
        }
        if (!/^[a-f0-9]{32,128}$/i.test(token)) return json({ error: "INVALID_TOKEN" }, 404);

        const { paypalConfig, madToCharge, createOrder } = await import("@/lib/paypal.server");
        const cfg = paypalConfig();
        if (!cfg) return json({ error: "NOT_CONFIGURED" }, 503);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: stayId } = await supabaseAdmin.rpc("guest_stay_for_token", {
          p_token: token,
        });
        if (!stayId) return json({ error: "INVALID_TOKEN" }, 404);

        const { data: portal } = await supabaseAdmin.rpc("guest_portal", { p_token: token });
        const outstanding = Number(
          (portal as unknown as { outstanding?: number } | null)?.outstanding ?? 0,
        );
        if (!(outstanding > 0)) return json({ error: "NOTHING_DUE" }, 400);

        const charge = madToCharge(outstanding);
        if (!(charge.amount > 0)) return json({ error: "NOTHING_DUE" }, 400);

        const { data: session, error: sErr } = await supabaseAdmin
          .from("payment_sessions")
          .insert({
            stay_id: stayId as unknown as string,
            guest_token: token,
            provider: "paypal",
            environment: cfg.environment,
            status: "created",
            amount_mad: outstanding,
            charged_currency: charge.currency,
            charged_amount: charge.amount,
            fx_rate: charge.rate,
          })
          .select("id")
          .single();
        if (sErr || !session) return json({ error: "SESSION_FAILED" }, 500);

        const origin = new URL(request.url).origin;
        const base = `${origin}/api/public/paypal/return?s=${session.id}`;

        try {
          const order = await createOrder({
            cfg,
            amount: charge.amount,
            currency: charge.currency,
            referenceId: session.id,
            returnUrl: base,
            cancelUrl: `${base}&cancel=1`,
          });
          await supabaseAdmin
            .from("payment_sessions")
            .update({ order_id: order.orderId, status: "pending_approval" })
            .eq("id", session.id);
          return json({ approveUrl: order.approveUrl });
        } catch (e) {
          await supabaseAdmin
            .from("payment_sessions")
            .update({ status: "failed", error_code: (e as Error).message.slice(0, 80) })
            .eq("id", session.id);
          return json({ error: "PROVIDER_ERROR" }, 502);
        }
      },
    },
  },
});
