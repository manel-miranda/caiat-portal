import { createClient } from "@supabase/supabase-js";
import { DEMO_EMAIL } from "./demo";
import { requireDemoConfig } from "./demo-config.server";
import { demoQuotaRequest } from "./demo-rate-limit.server";

/** A fresh client per request: never share a visitor's refresh token in server memory. */
export async function demoLogin(request: Request): Promise<Response> {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "ORIGIN_DENIED" }, { status: 403, headers });
  }
  let config: ReturnType<typeof requireDemoConfig>;
  try {
    config = requireDemoConfig();
  } catch {
    return Response.json({ error: "DEMO_NOT_CONFIGURED" }, { status: 404, headers });
  }
  const client = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    },
  });
  try {
    // A server-authenticated, per-address quota shared across Vercel instances.
    const quota = demoQuotaRequest(request);
    const { data: allowed, error: quotaError } = await client.rpc("demo_login_allowed_v2", quota);
    if (quotaError) {
      throw new Error(
        quotaError.message === "DEMO_QUOTA_UNAUTHORIZED"
          ? "DEMO_QUOTA_UNAUTHORIZED"
          : "DEMO_QUOTA_UNAVAILABLE",
      );
    }
    if (allowed !== true) {
      return Response.json(
        { error: "DEMO_BUSY" },
        { status: 429, headers: { ...headers, "Retry-After": "3600" } },
      );
    }
    const { data, error } = await client.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: config.password,
    });
    if (error || !data.session) throw new Error("DEMO_LOGIN_FAILED");
    return Response.json(
      {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
      { headers },
    );
  } catch (error) {
    // Never log credentials, sessions or upstream auth responses.
    const knownErrors = new Set([
      "DEMO_QUOTA_NOT_CONFIGURED",
      "DEMO_CLIENT_ADDRESS_UNAVAILABLE",
      "DEMO_QUOTA_UNAUTHORIZED",
      "DEMO_QUOTA_UNAVAILABLE",
      "DEMO_LOGIN_FAILED",
    ]);
    console.error("[demo-login]", {
      reason: error instanceof Error && knownErrors.has(error.message) ? error.message : "UNKNOWN",
      vercelRuntime: process.env["VERCEL"] === "1",
      quotaSecretConfigured: /^[a-f0-9]{64}$/.test(process.env["DEMO_RATE_LIMIT_SECRET"] ?? ""),
    });
    return Response.json({ error: "DEMO_UNAVAILABLE" }, { status: 503, headers });
  }
}
