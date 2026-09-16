import { afterEach, describe, expect, test } from "bun:test";
import { demoQuotaRequest } from "../src/lib/demo-rate-limit.server";
import { demoLogin } from "../src/lib/demo-login.server";
import { DEMO_SUPABASE_URL } from "../src/lib/demo";

const original = { ...process.env };
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
  Object.assign(process.env, original);
});
const env = { VERCEL: "1", DEMO_RATE_LIMIT_SECRET: "a".repeat(64) };
function request(ip = "192.0.2.1", role?: "staff" | "supervisor" | "admin" | string) {
  return new Request("https://demo.caiat-portal.com/api/public/demo/login", {
    method: "POST",
    headers: {
      origin: "https://demo.caiat-portal.com",
      "x-vercel-forwarded-for": ip,
      ...(role ? { "content-type": "application/json" } : {}),
    },
    ...(role ? { body: JSON.stringify({ role }) } : {}),
  });
}
function configure() {
  Object.assign(process.env, env, {
    DEMO_MODE: "true",
    VITE_DEMO_MODE: "true",
    SUPABASE_URL: DEMO_SUPABASE_URL,
    VITE_SUPABASE_URL: DEMO_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    DEMO_LOGIN_PASSWORD: "test-only-password-".repeat(3),
  });
}
describe("server controlled demo quota", () => {
  test("stable private buckets differ by IP and ignore browser forwarding headers", () => {
    const a = demoQuotaRequest(request(), env);
    expect(a.p_bucket.length).toBe(64);
    expect(a.p_bucket === demoQuotaRequest(request("192.0.2.2"), env).p_bucket).toBe(false);
    const spoofed = request();
    spoofed.headers.set("x-forwarded-for", "192.0.2.99");
    spoofed.headers.set("x-real-ip", "192.0.2.99");
    expect(demoQuotaRequest(spoofed, env).p_bucket).toBe(a.p_bucket);
    expect(demoQuotaRequest(request("2001:db8::1"), env).p_bucket).toBe(
      demoQuotaRequest(request("2001:0db8:0:0:0:0:0:1"), env).p_bucket,
    );
  });
  test("missing trust boundary, malformed addresses and missing secrets fail closed", () => {
    expect(() => demoQuotaRequest(request(), {})).toThrow("DEMO_QUOTA_NOT_CONFIGURED");
    expect(() => demoQuotaRequest(request(), { ...env, VERCEL: "0" })).toThrow(
      "DEMO_QUOTA_NOT_CONFIGURED",
    );
    for (const ip of ["", "unknown", "192.0.2.1, 192.0.2.2"]) {
      expect(() => demoQuotaRequest(request(ip), env)).toThrow("DEMO_CLIENT_ADDRESS_UNAVAILABLE");
    }
  });
  test("exhausted quota prevents Auth requests and never returns the secret", async () => {
    configure();
    let calls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      expect(String(input)).toContain("/rpc/demo_login_allowed_v2");
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual(demoQuotaRequest(request(), env));
      return Response.json(false);
    }) as typeof fetch;
    const response = await demoLogin(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("3600");
    expect(await response.json()).toEqual({ error: "DEMO_BUSY" });
    expect(calls).toBe(1);
  });
  test("invalid roles are rejected before quota or Auth", async () => {
    configure();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return Response.json(true);
    }) as typeof fetch;
    const response = await demoLogin(request("192.0.2.1", "owner"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_DEMO_ROLE" });
    expect(calls).toBe(0);
  });

  test("quota backend errors fail closed before Auth", async () => {
    configure();
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return Response.json({ message: "DEMO_QUOTA_UNAUTHORIZED" }, { status: 403 });
    }) as typeof fetch;
    expect((await demoLogin(request())).status).toBe(503);
    expect(calls).toBe(1);
  });
  test("allowed quota reaches Auth and returns only visitor tokens", async () => {
    configure();
    let calls = 0;
    const token = `${btoa(JSON.stringify({ alg: "HS256" }))}.${btoa(JSON.stringify({ sub: "test", exp: 4102444800 }))}.test`;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      if (String(input).includes("/rpc/")) return Response.json(true);
      expect(String(input)).toContain("/auth/v1/token");
      expect(JSON.parse(String(init?.body)).email).toBe("public-demo-staff@caiat.invalid");
      return Response.json({
        access_token: token,
        refresh_token: "test-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: "test", aud: "authenticated" },
      });
    }) as typeof fetch;
    const response = await demoLogin(request("192.0.2.1", "staff"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      access_token: token,
      refresh_token: "test-refresh",
    });
    expect(calls).toBe(2);
  });
});
