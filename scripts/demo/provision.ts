/** Run locally once with the DEMO project's server key; never on Vercel. */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { DEMO_IDENTITIES, DEMO_ROLES, DEMO_SUPABASE_URL } from "../../src/lib/demo";

if (process.env["SUPABASE_URL"] !== DEMO_SUPABASE_URL) throw new Error("DEMO_TARGET_REQUIRED");
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!key) throw new Error("Set the demo server key in your local environment, never in chat.");
const client = createClient(DEMO_SUPABASE_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const password = randomBytes(48).toString("base64url");
// Write before provisioning: successful accounts must never lose their shared hidden password.
const file = ".env.demo-password.local";
await writeFile(file, `DEMO_LOGIN_PASSWORD=${password}\n`, { mode: 0o600, flag: "wx" });

for (const role of DEMO_ROLES) {
  const identity = DEMO_IDENTITIES[role];
  const { data, error } = await client.auth.admin.createUser({
    id: identity.id,
    email: identity.email,
    password,
    email_confirm: true,
    app_metadata: { caiat_demo: true, demo_role: role },
  });
  if (error || !data.user) {
    throw new Error(
      `Demo ${role} account creation failed. Keep the password file and inspect demo Auth before retrying.`,
    );
  }
}
console.log(
  `Demo role accounts created. Copy DEMO_LOGIN_PASSWORD from ${file} into the demo Vercel project. Do not share this file.`,
);
