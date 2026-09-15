/** Run locally once with the DEMO project's server key; never on Vercel. */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { DEMO_EMAIL, DEMO_SUPABASE_URL, DEMO_USER_ID } from "../../src/lib/demo";

if (process.env["SUPABASE_URL"] !== DEMO_SUPABASE_URL) throw new Error("DEMO_TARGET_REQUIRED");
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!key) throw new Error("Set the demo server key in your local environment, never in chat.");
const client = createClient(DEMO_SUPABASE_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const password = randomBytes(48).toString("base64url");
// Write before provisioning: a successful account must never lose its password.
// Exclusive creation also makes accidental retries fail without rotating a live account.
const file = ".env.demo-password.local";
await writeFile(file, `DEMO_LOGIN_PASSWORD=${password}\n`, { mode: 0o600, flag: "wx" });
const { data, error } = await client.auth.admin.createUser({
  id: DEMO_USER_ID,
  email: DEMO_EMAIL,
  password,
  email_confirm: true,
  app_metadata: { caiat_demo: true },
});
if (error || !data.user) {
  throw new Error(
    "Demo account creation failed or its response was unavailable. Keep the password file and check the demo Auth users before retrying.",
  );
}
console.log(
  `Demo account created. Copy DEMO_LOGIN_PASSWORD from ${file} into the demo Vercel project. Do not share this file.`,
);
