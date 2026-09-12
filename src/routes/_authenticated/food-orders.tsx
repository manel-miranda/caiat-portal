/**
 * Legacy deep link. Food orders now live inside the unified Requests inbox.
 */
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/food-orders")({
  beforeLoad: () => {
    throw redirect({ to: "/requests", replace: true });
  },
});
