import { createFileRoute } from "@tanstack/react-router";

/**
 * Tells the guest portal whether online payment is usable.
 * Returns only a boolean + environment — never any credential.
 */
export const Route = createFileRoute("/api/public/paypal/status")({
  server: {
    handlers: {
      GET: async () => {
        const { paypalConfig } = await import("@/lib/paypal.server");
        const cfg = paypalConfig();
        return new Response(
          JSON.stringify({
            available: Boolean(cfg),
            provider: "paypal",
            environment: cfg?.environment ?? null,
          }),
          { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
