import { createClient } from "@supabase/supabase-js";
import { DEMO_EMAIL } from "./demo";
import { requireDemoConfig } from "./demo-config.server";

/** A fresh client per request: never share a visitor's refresh token in server memory. */
export async function demoLogin(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
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
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    },
  });
  try {
    // PostgreSQL supplies a shared, atomic quota across all Vercel instances.
    const { data: allowed, error: quotaError } = await client.rpc("demo_login_allowed");
    if (quotaError || !allowed) {
      return Response.json(
        { error: "DEMO_BUSY" },
        { status: 429, headers: { ...headers, "Retry-After": "60" } },
      );
    }
    const { data, error } = await client.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: config.password,
    });
    if (error || !data.session) throw new Error("DEMO_LOGIN_FAILED");
    return Response.json(
      { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
      { headers },
    );
  } catch {
    // Never log credentials, sessions or upstream auth responses.
    return Response.json({ error: "DEMO_UNAVAILABLE" }, { status: 503, headers });
  }
}
