// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const env = {
  ...loadEnv(process.env["NODE_ENV"] ?? "production", process.cwd(), ""),
  ...process.env,
};
const demoUrl = "https://llyihdkuplsyduxirvcg.supabase.co";
if (
  env["VITE_DEMO_MODE"] === "true" ||
  env["DEMO_MODE"] === "true" ||
  env["VITE_SUPABASE_URL"] === demoUrl
) {
  if (
    env["VITE_DEMO_MODE"] !== "true" ||
    env["DEMO_MODE"] !== "true" ||
    env["VITE_SUPABASE_URL"] !== demoUrl ||
    env["SUPABASE_URL"] !== demoUrl
  ) {
    throw new Error("Demo builds require both demo flags and the isolated demo Supabase URLs.");
  }
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
