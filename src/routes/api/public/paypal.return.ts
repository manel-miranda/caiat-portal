import { createFileRoute } from "@tanstack/react-router";

/**
 * PayPal return / cancel URL.
 *
 * Captures the order SERVER-SIDE, verifies it belongs to this payment session
 * and that PayPal reports COMPLETED with the expected amount/currency, then
 * records exactly one Caiat payment (idempotent via the unique
 * payments.external_reference index) and redirects back to the guest portal.
 */
export const Route = createFileRoute("/api/public/paypal/return")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("s") ?? "";
        const cancelled = url.searchParams.get("cancel") === "1";
        const back = (token: string, state: string) =>
          new Response(null, {
            status: 302,
            headers: { Location: `/guest/${token}?payment=${state}`, "Cache-Control": "no-store" },
          });
        const home = () => new Response(null, { status: 302, headers: { Location: "/" } });

        if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return home();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: session } = await supabaseAdmin
          .from("payment_sessions")
          .select("*")
          .eq("id", sessionId)
          .maybeSingle();
        if (!session) return home();

        if (cancelled) {
          if (session.status !== "completed") {
            await supabaseAdmin
              .from("payment_sessions")
              .update({ status: "cancelled" })
              .eq("id", session.id);
          }
          return back(session.guest_token, "cancelled");
        }

        // Already captured earlier (double return / refresh): nothing new to do.
        if (session.status === "completed") return back(session.guest_token, "success");
        if (!session.order_id) return back(session.guest_token, "error");

        const { paypalConfig, captureOrder } = await import("@/lib/paypal.server");
        const cfg = paypalConfig();
        if (!cfg) return back(session.guest_token, "error");

        try {
          const result = await captureOrder(cfg, session.order_id);
          const expected = Number(session.charged_amount);
          const ok =
            result.status === "COMPLETED" &&
            result.captureId !== null &&
            result.currency === session.charged_currency &&
            Math.abs((result.amount ?? 0) - expected) < 0.01;

          if (!ok) {
            await supabaseAdmin
              .from("payment_sessions")
              .update({ status: "failed", error_code: result.status.slice(0, 80) })
              .eq("id", session.id);
            return back(session.guest_token, "error");
          }

          const reference = `paypal:${result.captureId}`;
          let paymentId: string | null = null;

          const { data: inserted, error: insErr } = await supabaseAdmin
            .from("payments")
            .insert({
              stay_id: session.stay_id,
              amount: Number(session.amount_mad),
              method: "paypal",
              provider: `paypal_${cfg.environment}`,
              external_reference: reference,
              notes: `PayPal ${cfg.environment} — ${session.charged_amount} ${session.charged_currency} @ ${session.fx_rate}`,
            })
            .select("id")
            .single();

          if (insErr) {
            // Unique violation => this capture was already recorded.
            const { data: existing } = await supabaseAdmin
              .from("payments")
              .select("id")
              .eq("external_reference", reference)
              .maybeSingle();
            if (!existing) return back(session.guest_token, "error");
            paymentId = existing.id;
          } else {
            paymentId = inserted?.id ?? null;
          }

          await supabaseAdmin
            .from("payment_sessions")
            .update({ status: "completed", capture_id: result.captureId, payment_id: paymentId })
            .eq("id", session.id);

          return back(session.guest_token, "success");
        } catch (e) {
          await supabaseAdmin
            .from("payment_sessions")
            .update({ status: "failed", error_code: (e as Error).message.slice(0, 80) })
            .eq("id", session.id);
          return back(session.guest_token, "error");
        }
      },
    },
  },
});
