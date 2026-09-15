import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/demo/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { demoLogin } = await import("@/lib/demo-login.server");
        return demoLogin(request);
      },
    },
  },
});
