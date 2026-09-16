# Demo login quota v2 — rollout guide

This change is not active until the database, server secret and deployment are coordinated.
Only target Supabase `llyihdkuplsyduxirvcg` and Vercel `caiat-portal-demo`.
Do not modify production Supabase or rotate the existing account PINs/password.

## Behaviour

The server permits 20 login attempts per client IP per one-hour window. The database
increments each bucket atomically across server instances. Addresses are HMAC-hashed;
raw IPs are not stored. Valid requests prune bucket records older than one day.
The RPC requires a separate 256-bit server-only secret before touching any bucket.
The private configuration stores only its SHA-256 digest. No service-role key is
added to the application. Wrong or missing secrets fail closed.

Only `x-vercel-forwarded-for`, with `VERCEL=1`, is accepted. No browser-selected ID,
cookie, ordinary forwarding header or shared fallback bucket is used. Vercel's edge
must be the entry point: verify this header on the actual hosted deployment before
promotion. See [Vercel request headers](https://vercel.com/docs/headers/request-headers).
Other hosts/local development need a separately reviewed trusted-address adapter.

People behind the same public IP share a quota. Distributed callers or changing IPv6
addresses can obtain additional buckets; this is not DDoS protection. Supabase Auth
has its own limits, which can still affect availability independently of this fix.

## Staged rollout — keep the PR unmerged until steps 1–4 are ready

1. Verify the actual target connection is the demo. In a transaction, set
   `caiat.demo_target` to the demo project ref and apply `scripts/demo/login-quota-v2.sql`.
   This additive script requires `install.sql` already installed. It deliberately
   leaves the legacy function intact so the current app keeps working.
2. Generate 32 random bytes as 64 lowercase hexadecimal characters using a secure
   local utility. Store this as Sensitive `DEMO_RATE_LIMIT_SECRET` in ONLY the demo
   Vercel project's applicable Production and Preview environments. Do not paste the
   value into chat, Git, PRs, shell history or logs. Compute its SHA-256 digest locally
   and insert that digest into `demo_private.login_rate_config(secret_hash)` using
   an authenticated administrative connection. The original secret never needs to
   be submitted to the database administrator interface.
3. Deploy this branch to the demo preview. Enable Vercel's system environment variables
   so `VERCEL=1` is present. Check legitimate login, missing/invalid-secret denial,
   direct-RPC denial without the secret, quota isolation and simulated payments.
   Do not exhaust the live demo quota as a test: use the disposable database suite.
4. Confirm all CI checks and inspect changed-file lint. Review the PR, then merge and
   deploy the merged code to the existing demo production domain. Verify Try demo.
5. Once no active demo deployment depends on the old RPC, apply
   `scripts/demo/login-quota-finalize.sql` in a transaction with the same target guard.
   It revokes PUBLIC/anon/authenticated access to the legacy singleton RPC. Confirm
   that `has_function_privilege('anon','public.demo_login_allowed()','execute')` and
   the authenticated equivalent both return false. New logins must still work.
6. Run Supabase security advisors. The new RPC is intentionally anon-executable at
   the SQL role level, but requires the private server secret; private tables have
   RLS with no browser policies and no table grants.

The old vulnerability remains until step 5; do not report the rollout complete earlier.
Fresh demo installations must also apply v2, configure the secret, and finalize.
The original install script is retained as historical baseline for compatibility.

## Rollback

Before finalization, roll back the app; the legacy RPC is still available.
After finalization, prefer rolling forward. An emergency rollback to the old app
requires explicitly restoring its RPC grants, which reintroduces the known global
quota issue. Do not silently restore those grants or disable rate limiting.

Rotate the quota secret only as a coordinated server/database operation; it is
independent of staff PINs and of the shared demo account password.

## Rollout checkpoint — 2026-09-16

The additive v2 schema and secret digest have been applied to the verified demo
project. The Vercel secret has been configured by the project owner. A fresh
preview must verify the paired configuration before merge. Legacy RPC access
remains enabled until the final deployment verification and finalize step.
