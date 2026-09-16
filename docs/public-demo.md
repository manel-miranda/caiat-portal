# Public demo setup and operations

The public demo uses **only** Supabase project `llyihdkuplsyduxirvcg` (`caiat-portal-demo`, eu-west-1).
Production project `lyelbztfulqwpwlvmvam`, the existing Vercel project, Lovable, and the root/www DNS records are outside this setup.

The app is TanStack Start + React + Vite + Nitro. Do not choose a Next.js deployment preset.

## Current rollout

- Dedicated branch: `feature/public-demo`, based on `ef114a6ebaf638c0118dc3d23df2641254802309`.
- The demo's grouped baseline migration history was inspected before setup; the repository migrations were **not** replayed.
- `scripts/demo/install.sql` and `scripts/demo/schedule.sql` were applied to the demo project as `public_demo_restrictions_and_reset` and `public_demo_hourly_schedule`. The follow-up `public_demo_auth_provisioning_compatibility` adapts the Auth guard to Supabase’s transactional account creation. New installations already include that fix in `install.sql`; do not apply `provisioning-compat.sql` a second time.
- Five fictional guests and five stays use dates relative to today; phone/email fields are empty.
- Database permissions, simulated-payment enforcement, and hourly reset jobs are installed.
- The demo account is provisioned and the separate deployment is live at `https://caiat-portal-demo.vercel.app` (deployment `dpl_6428EhZiUrRBr9bi87dRu7zt8qhK`). The browser's Try demo button opens the operational dashboard.
- Hosted verification passed: login, stay creation, charge entry, simulated payment, checkout, role-change denial and account-metadata-change denial. PayPal remains disabled. Scheduled jobs have successful runs.
- `public_demo_auth_generated_columns_compatibility` was applied after testing against Supabase's generated Auth columns. BEFORE triggers cannot inspect generated values; their underlying email/confirmation fields remain protected. New installs contain this fix; existing installs use `generated-columns-compat.sql` once.
- `https://demo.caiat-portal.com` is live. Amen CNAME, Vercel domain configuration, certificate validation, HTTPS landing page and real login were verified on 2026-09-16. README links to the working demo.

## 1. Provision the demo role accounts locally

This is a one-time setup. Visitors choose Staff, Supervisor, or Admin. They cannot register, see the shared hidden password, or receive an email.

1. In the [demo project's API Keys page](https://supabase.com/dashboard/project/llyihdkuplsyduxirvcg/settings/api-keys), copy a server secret key (or legacy service-role key).
2. Put it in the ignored local `.env.demo-bootstrap.local` file, together with the exact demo URL:

   ```dotenv
   SUPABASE_URL=https://llyihdkuplsyduxirvcg.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<demo server key, entered locally>
   ```

3. From the demo branch, run:

   ```sh
   bun --env-file=.env.demo-bootstrap.local scripts/demo/provision.ts
   ```

   If the setup file is in a different checkout, supply its absolute path instead.

4. The script creates three restricted role accounts with one random hidden password and writes it to `.env.demo-password.local`. Keep this file private. Copy its `DEMO_LOGIN_PASSWORD` value into **only the demo Vercel project** in step 2. Never paste keys/passwords into chat or commit them.
5. Remove the temporary bootstrap file after provisioning. The running app does **not** need the Supabase server key.

The script refuses any other Supabase URL. It also refuses to overwrite an existing password file. Three fixed user IDs, available only through the Auth Admin API, identify the role accounts during provisioning. Account changes, MFA enrollment, identity linking and new registrations are blocked in the demo database. Do not rotate this account's password through the ordinary application; maintenance requires an explicit database maintenance window for the demo guard.

## 2. Configure the separate Vercel project

The separate project `caiat-portal-demo` (`prj_L9h43OEgxAfZVrgOzQxyAPAhwqYv`) has been created in team `team_GRqPbwW56IJrlHglj1j019u5` through the authenticated CLI. Its build settings and demo-only public environment variables are configured. The role accounts are provisioned and `DEMO_LOGIN_PASSWORD` is stored as a Sensitive variable for Production and Preview. The temporary local server-key file was removed. The connector still returns zero projects; use the CLI or dashboard to inspect this existing demo project. Do not create a duplicate.

The following settings document the setup and remaining launch steps:

1. Open your Vercel dashboard, choose `mjlamiranda-gmailcoms-projects`, then open **caiat-portal-demo**.
2. Confirm the connected repository is `manel-miranda/caiat-portal`.
3. Use the repository root, Framework Preset **Other**, Install Command `bun install --frozen-lockfile`, and Build Command `bun run build`. Leave Output Directory at its default: Nitro supplies the Vercel Build Output API files.
4. Add the following variables to this project's Production and Preview environments. Get the publishable key from the same demo API Keys page; it starts with `sb_publishable_` and is safe for browser use.

   | Variable                                                       | Value                                                         |
   | -------------------------------------------------------------- | ------------------------------------------------------------- |
   | `NITRO_PRESET`                                                 | `vercel`                                                      |
   | `VITE_DEMO_MODE`                                               | `true`                                                        |
   | `DEMO_MODE`                                                    | `true`                                                        |
   | `VITE_SUPABASE_URL` and `SUPABASE_URL`                         | `https://llyihdkuplsyduxirvcg.supabase.co`                    |
   | `VITE_SUPABASE_PROJECT_ID` and `SUPABASE_PROJECT_ID`           | `llyihdkuplsyduxirvcg`                                        |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_PUBLISHABLE_KEY` | Demo publishable key                                          |
   | `DEMO_LOGIN_PASSWORD`                                          | Private value from `.env.demo-password.local`; mark Sensitive |

   Do not copy production environment variables. Do not add PayPal credentials or a Supabase service-role key to this Vercel project.

5. The demo project currently ignores automatic builds outside `feature/public-demo` using `test "$VERCEL_GIT_COMMIT_REF" != "feature/public-demo"` as its Ignored Build Step. Remove that temporary rule after merge. The initial demo deployment explicitly targets Production from the demo branch. In the **new demo project's Settings → Environments → Production → Branch Tracking**, set `feature/public-demo` while the PR is under review. Once the PR is approved and merged, switch this **demo project's** tracking to `main`. Do not change the live project's tracking.
6. In Deployments, create a deployment from the selected branch. Confirm its commit includes this implementation; an initial import from older `main` does not include the demo login.
7. Open the generated Vercel URL and complete the checks below. A public demo ultimately needs its production URL accessible without Vercel account login; retain protection on previews if desired.

Vercel references: [Git deployments and branch tracking](https://vercel.com/docs/git), [build settings](https://vercel.com/docs/builds/configure-a-build).

## 3. Verify before adding DNS or the GitHub link

- The landing page says **Public demo**, offers **Staff**, **Supervisor**, and **Admin**, and needs no registration.
- Staff opens the daily operational view; Supervisor opens the broader operational view; Admin shows all management destinations. `/account` explains that settings are locked. Admin can inspect `/users` and `/catalogue`, but security and persistent configuration changes remain locked.
- Create a stay in a free room, add a charge, record a simulated cash/card payment, then check out. These ledger entries do not contact a payment provider.
- `GET /api/public/paypal/status` reports `available: false`; create-order and return requests are blocked with `DEMO_PAYMENTS_DISABLED`.
- The hourly reset removes visitor changes and restores five current fictional stays. Refresh an open page after a reset; a form holding an old stay ID can fail because that stay no longer exists.
- Check Supabase **Integrations → Cron** for successful runs of `caiat-demo-hourly-reset` and `caiat-demo-session-cleanup`.

After the Vercel URL works:

1. In **caiat-portal-demo → Settings → Domains**, add `demo.caiat-portal.com`.
2. Copy the **exact DNS type, name and destination Vercel displays** into Amen's DNS zone. Change only the `demo` record. Add a verification TXT record only if Vercel requests one.
3. Leave the existing root (`@`) and `www` records unchanged. Do not guess a generic CNAME destination.
4. Wait for Vercel to show valid DNS and HTTPS, then retest `https://demo.caiat-portal.com`.
5. Only then add `[Try the public demo](https://demo.caiat-portal.com)` near the top of README and use that URL as the GitHub repository's demo link.

Vercel supplied this exact record on 2026-09-16: **CNAME**, host **demo**, target **1b326ea547255a3d.vercel-dns-017.com.** DNS is hosted at Amen and now resolves correctly; HTTPS and custom-domain login were verified. No ownership TXT challenge was requested.

## Security design

- Three fixed demo identities represent Staff, Supervisor, and Admin. `has_role` checks the signed-in identity against its immutable database role. `has_permission` uses fixed role allowlists instead of editable metadata or permission rows.
- All public function execution grants are revoked first, then only reviewed operational and guest-portal functions are granted back. Admin can inspect management screens, while user/security RPCs and persistent catalogue or inventory configuration remain inaccessible.
- Table privileges prevent security-table changes. Auth-table triggers also block direct Auth API credential changes, registration, identity linking and MFA enrollment.
- PayPal is blocked in the route handlers and provider helper even if live credentials are mistakenly present. The demo database rejects provider payment sessions and stamps ordinary ledger payments as simulated.
- The browser receives a normal restricted session; the shared password remains on the server. The login response is not cacheable, checks its Origin, and uses a server-authenticated database quota of 20 attempts per client IP per hour across server instances. Supabase's own Auth rate limits also apply.
- Visitors share data and can affect one another's operational work. Sign-out in the UI uses local session scope. The database reset is transactional, runs hourly at minute zero, and has a five-second lock timeout; a blocked reset fails safely and the next scheduled run retries. Sessions older than 24 hours are pruned at minute 15.
- `demo_private` is not exposed through the Data API; visitors cannot reset data or edit the login quota. Future schema changes must review this demo allowlist and reset's explicit table list.

### Advisor review

The remaining SECURITY DEFINER execution notices are expected for the explicit operational RPC allowlist and token-validated guest portal. These functions need their existing permission/token checks to perform atomic workflows under RLS. The anonymous login quota endpoint only increments a bounded private counter. Security administration and private reset functions are not visitor-executable. The private login quota and provisioning tables intentionally have RLS with no browser policy; only their narrowly scoped definer functions can update them.

See Supabase's explanations for [anonymous function execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [authenticated function execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Database installation notes

The demo-only SQL is deliberately **outside `supabase/migrations`**, so an ordinary production migration run cannot apply it. Do not run `supabase db push` against the existing demo: its original 47 migrations were grouped into 11 hosted baseline entries.

The installer is one-time and refuses nonempty Auth. It requires the executing session to explicitly set `caiat.demo_target = 'llyihdkuplsyduxirvcg'` after checking the target project. This setting is an operator safeguard, not proof of project identity: always verify the actual connection/project ID first. Run the installer in a transaction. The scheduling file is independently guarded and uses named jobs, avoiding duplicate schedules.

To inspect the installed state in the **demo project's** SQL editor:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
select jobname, schedule, active from cron.job where jobname like 'caiat-demo-%';
select jobid, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 10;
```

Do not reapply the installer to an already provisioned project. For changes, create a reviewed demo-specific follow-up migration and test it on a disposable database first.

## Local verification

```sh
bun install --frozen-lockfile
bun run check
bun run lint
INVENTORY_TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres bun run test
```

The tests use disposable PostgreSQL databases. `tests/public-demo.test.ts` applies the normal repository baseline and then the demo-only installer, verifying both permitted operational work and direct bypass attempts. `tests/demo-server.test.ts` checks environment isolation, login origin/configuration checks and provider blocking. Full end-to-end authentication requires the actual demo account and its local/server-only password.

## Demo role selector

The public landing page sends only the selected role name to the server. The server maps it to one
of three fixed demo emails and signs in with the existing server-only password. The browser never
receives that password. Staff receives payment and request permissions; Supervisor receives the full
operational allowlist; Admin receives complete navigation and read-only access to security and
configuration screens. Auth guards, table grants and the demo-only RPC allowlist keep credential,
role, catalogue configuration and real-payment changes locked.
