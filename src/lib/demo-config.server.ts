import { DEMO_SUPABASE_URL } from "./demo";

type Environment = Record<string, string | undefined>;

/** Also fails closed when a demo URL is configured but a mode flag was omitted. */
export function demoEnvironment(env: Environment = process.env): boolean {
  return (
    env["DEMO_MODE"] === "true" ||
    env["VITE_DEMO_MODE"] === "true" ||
    env["SUPABASE_URL"] === DEMO_SUPABASE_URL ||
    env["VITE_SUPABASE_URL"] === DEMO_SUPABASE_URL
  );
}

export function requireDemoConfig(env: Environment = process.env) {
  if (
    env["DEMO_MODE"] !== "true" ||
    env["VITE_DEMO_MODE"] !== "true" ||
    env["SUPABASE_URL"] !== DEMO_SUPABASE_URL ||
    env["VITE_SUPABASE_URL"] !== DEMO_SUPABASE_URL ||
    !env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    !env["DEMO_LOGIN_PASSWORD"] ||
    env["DEMO_LOGIN_PASSWORD"].length < 32
  ) {
    throw new Error("DEMO_NOT_CONFIGURED");
  }
  return {
    url: DEMO_SUPABASE_URL,
    key: env["VITE_SUPABASE_PUBLISHABLE_KEY"],
    password: env["DEMO_LOGIN_PASSWORD"],
  };
}
