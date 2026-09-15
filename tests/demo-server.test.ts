import { afterEach, describe, expect, test } from "bun:test";
import { demoEnvironment, requireDemoConfig } from "../src/lib/demo-config.server";
import { DEMO_SUPABASE_URL } from "../src/lib/demo";
import { paypalConfig, createOrder, captureOrder } from "../src/lib/paypal.server";
import { demoLogin } from "../src/lib/demo-login.server";

const original = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});
describe("demo isolation and payment boundaries", () => {
  test("configuration rejects production URLs and missing flags", () => {
    expect(() =>
      requireDemoConfig({
        DEMO_MODE: "true",
        SUPABASE_URL: "https://lyelbztfulqwpwlvmvam.supabase.co",
      }),
    ).toThrow("DEMO_NOT_CONFIGURED");
    expect(() => requireDemoConfig({})).toThrow("DEMO_NOT_CONFIGURED");
    expect(demoEnvironment({ SUPABASE_URL: DEMO_SUPABASE_URL })).toBe(true);
    expect(demoEnvironment({})).toBe(false);
  });
  test("PayPal stays disabled even with complete live credentials", async () => {
    process.env["DEMO_MODE"] = "true";
    process.env["PAYPAL_CLIENT_ID"] = "test-client";
    process.env["PAYPAL_CLIENT_SECRET"] = "test-secret";
    process.env["PAYPAL_ENVIRONMENT"] = "live";
    expect(paypalConfig()).toBeNull();
    const cfg = {
      clientId: "test",
      clientSecret: "test",
      environment: "live" as const,
      apiBase: "https://invalid.test",
    };
    await expect(
      createOrder({
        cfg,
        amount: 1,
        currency: "EUR",
        referenceId: "test",
        returnUrl: "",
        cancelUrl: "",
      }),
    ).rejects.toThrow("DEMO_PAYMENTS_DISABLED");
    await expect(captureOrder(cfg, "test")).rejects.toThrow("DEMO_PAYMENTS_DISABLED");
  });
  test("login rejects a foreign origin and remains absent on production", async () => {
    const foreign = await demoLogin(
      new Request("https://demo.caiat-portal.com/api/public/demo/login", {
        method: "POST",
        headers: { Origin: "https://elsewhere.test" },
      }),
    );
    expect(foreign.status).toBe(403);
    delete process.env["DEMO_MODE"];
    const disabled = await demoLogin(
      new Request("https://caiat-portal.com/api/public/demo/login", {
        method: "POST",
        headers: { Origin: "https://caiat-portal.com" },
      }),
    );
    expect(disabled.status).toBe(404);
    expect(disabled.headers.get("cache-control")).toBe("no-store");
  });
});
