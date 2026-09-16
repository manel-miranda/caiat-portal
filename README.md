# Caiat Operations

**A mobile-first guesthouse operations portal built for a real 7-room property in Morocco.**
It brings reservations, stays, customers, staff permissions, service requests, billing,
cash control, kitchen orders, inventory and the guest experience into one system.

## Try the public demo

**[Open Caiat Portal](https://demo.caiat-portal.com)** — no registration required.

Choose **Staff**, **Supervisor**, or **Admin** to see how the interface and permissions adapt
to each role. The demo uses shared fictional data, resets hourly and simulates every payment.
Admin can inspect the complete navigation, including Users, Catalogue and Stock, while
credential, security and persistent configuration changes remain locked.

**Live staff instance:** [caiat-portal.com](https://caiat-portal.com). Staff access requires
authentication; guest links use private per-stay tokens.

See the [isolated demo operations guide](docs/public-demo.md) for setup, restrictions and reset details.

---

## Feature overview

Finance indicators are available under **Manage → Finance** to users with the
`activity_view` permission (normally Supervisor and Admin). They show latest
recorded ingredient purchase costs, recipe cost per portion, estimated ingredient
gross profit, and margin percentage. Missing costs remain unknown; labour,
overheads, taxes, and waste are not included, so these are not net-profit figures.
The average is an unweighted average of dishes with a calculable margin.
The isolated public demo includes its demo-only recipes; costs stay unknown until
purchase prices are recorded. Production excludes demo-only recipes by default.

Existing curated guest food recommendations are ordered by margin within each
dish's suggestions, with unknown margins last and curated order preserved for ties.
Guest responses never include internal costs or margins. This feature does not
provide sales forecasts or customer-level profitability profiling.

Deploy the two `20260916` finance migrations before releasing the frontend, to both
the production and isolated demo databases. The demo installer also allowlists the
read-only finance RPC; existing demo installations receive its grant via migration.

| Area                      | Capabilities                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Daily operations**      | Live room board, stays, arrivals and departures, reservation calendar, charges, service requests, payments and guarded checkout                                                           |
| **Customers**             | Searchable customer database, returning-guest indicators, contact details, internal notes, stay history and billed/paid totals                                                            |
| **Users & access**        | Supabase authentication; Admin, Supervisor and Staff roles; user creation and deactivation; PIN management; role defaults and per-user permission overrides                               |
| **Dashboard & control**   | Occupancy, guests in house, daily revenue and payments, outstanding balances, expected cash, reconciliation and drill-downs                                                               |
| **Kitchen & inventory**   | Food orders, ingredient recipes, automatic stock consumption, purchase and supplier records, low/out-of-stock alerts, shopping recommendations, waste/adjustments and forecast simulation |
| **Catalogue**             | Multilingual items, prices, categories, availability, featured/signature flags, configurable recipes and curated cross-sell recommendations                                               |
| **Guest portal**          | Revocable per-stay access link and QR code, bill and request tracking, service catalogue, food ordering, PayPal Sandbox flow, recommendations and a 3D/AR dish prototype                  |
| **Realtime alerts**       | Supabase Realtime refreshes operational screens; the task bell combines pending reservations, overdue requests, food orders and low-stock warnings                                        |
| **Audit & security**      | Append-only activity log, actor and timestamp tracking, Row Level Security, permission-checked database RPCs and token-scoped guest access                                                |
| **Mobile & localisation** | Installable PWA, offline awareness, Moroccan dirham accounting, Casablanca business-day rules, and English, Portuguese, French and Arabic with RTL support                                |

---

## Contents

- [Feature overview](#feature-overview)
- [What it does](#what-it-does)
- [Screenshots](#screenshots)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Security model](#security-model)
- [Testing strategy](#testing-strategy)
- [How this was built](#how-this-was-built)
- [Known limitations](#known-limitations)
- [Running it locally](#running-it-locally)
- [Project layout](#project-layout)

---

## What it does

The guesthouse owner was running a 7-room property through paper, WhatsApp and memory and
could not step away without losing visibility. Caiat replaces those disconnected routines
with a small, mobile-first system designed for staff who are not comfortable with software.

### Staff

- **Room board and calendar** - see room status, occupancy, arrivals, departures and pending
  reservations, then open or create a stay directly from the monthly calendar.
- **Stays and customer context** - create a booking for a new or returning customer and keep
  accommodation, charges, requests, payments and guest access together.
- **Charges and requests** - choose services from the configured catalogue, schedule guest
  requests, track pending/completed/cancelled states and add the matching charge when needed.
- **Payments and checkout** - record cash, card or bank transfer with the receiving user and
  timestamp. Checkout validates the balance and unfinished kitchen orders before closing.
- **Kitchen orders** - staff and guests can place food orders; delivery bills the stay and
  consumes each recipe ingredient exactly once.
- **Live task bell** - pending reservations, scheduled or overdue requests, requested food
  orders and low-stock items update as the underlying records change.

### Supervisor / admin

- **Operational dashboard** - occupancy, guests in house, revenue and payments recorded
  today, outstanding balances, cash expected in the safe, and the next 24 hours, all with
  drill-down detail.
- **Customer history** - search by name, phone or email; see first/last stay, full stay
  history, billed and paid totals, returning-customer status and private staff notes.
- **Cash control** - compare cash received by employee with the physical safe count and save
  the resulting reconciliation for the business day.
- **Users, roles and permissions** - create or deactivate users, assign Admin, Supervisor or
  Staff, reset PINs and apply per-user grants or revocations over the role defaults.
- **Catalogue and recommendations** - configure multilingual items, prices, visibility,
  availability, categories, ordering, featured/signature status and curated cross-sells.
- **Recipes, purchasing and stock forecast** - map dish portions to ingredients, record
  suppliers and purchases, track estimated stock, receive/adjust/waste stock, generate a
  recommended shopping list and simulate future consumption.
- **Activity log** - inspect the append-only record of who performed each important action,
  what changed and when.

### Guest

- **Private QR portal** - staff generate, display, copy, regenerate or revoke a per-stay link.
  The guest needs no account; the bearer token scopes all portal data to that stay.
- **Self-service stay view** - guests see their bill and request statuses, browse the service
  catalogue, submit requests and place kitchen orders.
- **Discovery features** - configured recommendations suggest related items, while a
  prototype 3D/AR tajine viewer lets guests rotate a dish or place it on a supported device.
- **PayPal Sandbox flow** - server-side order creation, redirect, capture and amount/currency
  validation mirror the real payment path. The public demo keeps provider calls disabled and
  records only clearly marked simulated payments.

### Throughout

- **Realtime synchronisation** - one Supabase Realtime channel refreshes affected screens
  when stays, charges, payments, requests, customers, permissions or inventory change in
  another tab or device.
- **Database-enforced security** - PostgreSQL roles, Row Level Security and permission-checked
  RPCs remain authoritative; the client hides unavailable actions only for usability.
- **PWA** - installable to the home screen, with connectivity awareness that blocks mutations
  while offline instead of losing them silently. There is no service worker yet, so it is
  installable but not offline-capable.
- **Four languages** - English, Portuguese, French and Arabic, including full RTL layout.
- **MAD-native** - Moroccan dirham is the accounting currency, with `Africa/Casablanca` as
  the business-day boundary.

---

## Screenshots

Desktop views. Guest and operational data are fictional test data; the administrator
display name is real.

|                                                                                                                                                     |                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Staff room board](docs/screenshots/caiat-room-board.jpg)<br>**Staff room board** - all 7 rooms with status, above today's arrivals and departures | ![Stay detail](docs/screenshots/caiat-stay-detail.jpg)<br>**Stay detail** - itemised bill with total, paid and outstanding balance                      |
| ![Owner dashboard](docs/screenshots/caiat-dashboard.jpg)<br>**Owner dashboard** - occupancy, revenue, cash expected in safe, each with a drill-down | ![Cash control](docs/screenshots/caiat-cash-control.jpg)<br>**Cash control** - cash by employee and expected in safe, against the counted total         |
| ![Guest portal](docs/screenshots/caiat-guest-portal.jpg)<br>**Guest portal** - the service catalogue, reached only through a per-stay access token  | ![Stock and groceries](docs/screenshots/caiat-stock.jpg)<br>**Stock & groceries** - ingredient levels, buy suggestions and receive/adjust/waste actions |

---

## Tech stack

| Layer           | Choice                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Framework       | [TanStack Start](https://tanstack.com/start) (full-stack React, file-based routing + server routes) |
| UI              | React 19, TypeScript, Tailwind CSS 4, [shadcn/ui](https://ui.shadcn.com) on Radix primitives        |
| Data            | TanStack Query, TanStack Router and Supabase Realtime                                               |
| Backend         | [Supabase](https://supabase.com) - PostgreSQL, Auth, Row Level Security                             |
| Payments        | PayPal REST Orders v2 Sandbox flow; simulated and provider-disabled in the public demo              |
| Build / runtime | Vite 8, [Bun](https://bun.sh)                                                                       |
| CI              | GitHub Actions - typecheck, build, and database regression tests on a real PostgreSQL service       |
| Hosting         | Vercel serves `caiat-portal.com` and the isolated `demo.caiat-portal.com` deployment                |

This is a **TanStack Start** application on React, Vite and Supabase. It is **not** a Next.js
project, the ESLint config actively blocks Next's `server-only` import, because server code
here is marked with the `*.server.ts` convention instead.

### Deployment

Verified from the live site and this repository:

- `caiat-portal.com` is served by **Vercel** (confirmed via `server: Vercel` and `x-vercel-id`
  response headers).
- The Lovable subdomain `caiat-portal.lovable.app` **redirects** to `caiat-portal.com`.
- Vercel builds a **preview deployment for each pull request** on this repository; preview
  URLs sit behind Vercel's deployment protection and are not publicly browsable.
- The repository retains its **Lovable** integration and build package. Lovable changes
  must follow the same branch, PR, and CI requirements as other contributors; see
  [`AGENTS.md`](AGENTS.md). Direct sync to protected `main` is not permitted.

Which branch Vercel promotes to production, and the exact division of responsibility between
the Lovable and Vercel pipelines, is configured outside this repository and is not documented
here rather than guessed at.

---

## Architecture

The guiding decision is that **PostgreSQL is the application's trust boundary, not the
browser**. The React app is a client of a permission-aware database, not the authority over
it.

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React 19 / TanStack Start)                         │
│                                                              │
│   Staff app (/_authenticated/*)     Guest portal (/guest/:t) │
│           │                                  │               │
│      supabase-js (anon key, user JWT)   anon, token-scoped   │
└───────────┼──────────────────────────────────┼───────────────┘
            │                                  │
            ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL (Supabase)                                       │
│                                                              │
│   RLS policies on every table  ──┐                           │
│                                  ├─ has_permission(uid, key) │
│   SECURITY DEFINER RPCs        ──┘                           │
│   (create_stay_with_guest, checkout_stay, cash_reconcile,    │
│    guest_portal, staff_create_food_order, …)                 │
│                                                              │
│   audit_log ← written by the RPCs, not the client            │
└─────────────────────────────────────────────────────────────┘
            ▲
            │ service-role key, server-only
┌───────────┴─────────────────────────────────────────────────┐
│  Server routes (/api/public/paypal/*)                        │
│  Order creation and capture. The browser never sees the      │
│  PayPal credentials or the capture result.                   │
└─────────────────────────────────────────────────────────────┘
```

**Data model.** `Guest → Stay → Room` is the spine; `Stay` is the central object that
charges, requests and payments hang off. Around it sit an inventory ledger
(`inventory_items`, `inventory_movements`, `inventory_recipe_components`, `purchases`,
`suppliers`), kitchen orders, cash reconciliations, guest access tokens, payment sessions
and an append-only audit log (25 tables across 47 additive migrations).

**Mutations go through RPCs, not table writes.** Anything with a rule attached (creating a
stay, checking out, reconciling cash, completing a request, consuming inventory) is a
`SECURITY DEFINER` PostgreSQL function that checks permissions, enforces the rule, writes
the audit row and returns. Direct `INSERT`/`UPDATE` on those tables is revoked from the
`authenticated` role, so the rule cannot be bypassed by a crafted client request.

**The guest portal never touches tables.** Everything a guest can see or do goes through
token-validating RPCs (`guest_portal`, `guest_create_request`,
`guest_create_preview_food_order`) that return only guest-safe fields. The underlying
stays, guests, charges and payments tables stay closed to anonymous users entirely.

---

## Security model

This is the part of the project I put the most deliberate work into, and the part I would
most want someone to read.

### Server-authoritative state transitions

Anything the client could lie about is recomputed server-side. Cash reconciliation is the
clearest example, the browser submits **only the physical count**:

```sql
-- supabase/migrations/20260914003000_security_review_hardening.sql
SELECT coalesce(sum(p.amount), 0)
  INTO v_expected
  FROM public.payments p
 WHERE p.method = 'cash'
   AND p.created_at >= v_start   -- Africa/Casablanca business day
   AND p.created_at <  v_end;
```

The expected total is derived from actual payment rows inside the function. A tampered
client cannot report a convenient "expected" figure, because it never supplies one.

### Permissions enforced once, mirrored for UX

Three roles (`admin`, `supervisor`, `staff`) supply defaults; a `user_permissions` table
carries per-user grants and revocations. Three keys, `users_manage`, `roles_manage`,
`pin_reset` are admin-only and not grantable at all.

`has_permission(uid, key)` in the database is the single enforcement point.
`src/lib/permissions.ts` mirrors the same rules on the client **only so the UI can hide what
the server would refuse anyway**, it grants nothing.

### Hardened function definitions

`SECURITY DEFINER` functions pin their schema resolution with `SET search_path`. Without
that, a definer function is vulnerable to schema-shadowing privilege escalation, a subtle
failure mode that is easy to miss and expensive to discover late.

Execution grants fall into **two deliberately different classes**, and the distinction
matters:

**Staff and admin RPCs** revoke execution from `PUBLIC` and `anon`, and grant it only to
`authenticated` and `service_role`. An anonymous caller cannot invoke them at all:

```sql
-- supabase/migrations/20260914003000_security_review_hardening.sql
REVOKE ALL ON FUNCTION public.cash_reconcile(date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_reconcile(date, numeric, text) TO authenticated, service_role;
```

**Guest-token RPCs intentionally permit `anon`**, because the guest portal has no account
to authenticate with. Three functions are granted this way,`guest_portal`,
`guest_create_request` and `guest_create_preview_food_order`. Each takes a token as its
first argument and validates it internally before returning or writing anything:

```sql
-- supabase/migrations/20260914003000_security_review_hardening.sql
REVOKE ALL ON FUNCTION public.guest_create_preview_food_order(text, jsonb, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.guest_create_preview_food_order(text, jsonb, text, text)
  TO anon, authenticated, service_role;
```

So the security boundary for guest access is **token validation inside the function**, not
the execution grant. The underlying tables stay closed to `anon` regardless; the token
scopes every read and write to one stay. Supporting functions that should never be reachable
anonymously are revoked accordingly, `guest_stay_for_token` is revoked from `anon` _and_
`authenticated`, and `guest_token_generate` / `guest_token_revoke` are staff-only.

### Payments

PayPal orders are created and captured entirely server-side. On return, the handler
verifies that PayPal reports `COMPLETED`, that the captured **amount and currency match
what was recorded** for the payment session, and only then records a payment. A unique
index on `payments.external_reference` prevents the same capture reference from being
recorded twice. The handler skips capture when the stored session is already completed;
these safeguards do not by themselves establish that every retry or concurrent capture
scenario is safe.

```ts
// src/routes/api/public/paypal.return.ts
const ok =
  result.status === "COMPLETED" &&
  result.captureId !== null &&
  result.currency === session.charged_currency &&
  Math.abs((result.amount ?? 0) - expected) < 0.01;
```

Redirect parameters identify the payment session and indicate cancellation; they do not
prove payment success. The handler verifies the server-side PayPal capture response against
the stored session before recording a payment. PayPal credentials are kept in server-side
environment variables and are not shipped to the browser.

To be precise about status: this flow is **implemented and reviewed by reading, but
end-to-end Sandbox verification is pending**. There are no automated tests covering the
PayPal path, and no recorded Sandbox test run in this repository. Treat the description
above as what the code does, not as a verified transaction result.

### Auditability

`audit_log` rows are written by the RPCs themselves, not by the client, so the trail cannot
be skipped by going around the UI. Every significant action carries the acting user, the
timestamp and the affected entity.

---

## Testing strategy

Most of the guarantees in this application live in the database, so that is where most of
the tests are. The current CI run passes **133 tests across 17 files**, together with
separate application/test typechecks and a production build.

The PostgreSQL-backed suites each create a throwaway database, apply a small Supabase
prelude plus **every real file in `supabase/migrations`**, and call the real RPCs as users
with real roles and permissions. No hosted Supabase project is contacted. The public-demo
suite also applies the separate demo installer and role-selector SQL, checking permitted
work as well as credential, role and configuration bypass attempts.

Pure TypeScript suites cover logic that does not require PostgreSQL, including dashboard
calculations, PWA behaviour and the server-side public-demo login boundary. Without a
database URL the PostgreSQL suites skip locally; CI sets `INVENTORY_TESTS_REQUIRED=1` so a
missing database becomes a failure rather than a misleading green run.

Coverage focuses on the areas where a bug costs money or leaks data:

| Suite                         | What it pins down                                           |
| ----------------------------- | ----------------------------------------------------------- |
| `inventory-consumption`       | Kitchen orders deduct stock exactly once, even on retry     |
| `system-permissions`          | Staff/supervisor/admin boundaries and RLS across the schema |
| `security-review-hardening`   | The hardening pass above stays enforced                     |
| `food-order-checkout`         | Checkout cannot complete over an unfinished kitchen order   |
| `purchases`                   | Purchase recording and its permission guard                 |
| `catalogue-hardening`         | Service catalogue creation defaults and key collisions      |
| `request-billing-permissions` | Completing a billable request requires the right permission |

CI runs them against a `postgres:16` service container and sets `INVENTORY_TESTS_REQUIRED=1`,
which turns "no database available" into a **failure** rather than a silent skip, a
skipped security test is worse than no test, because it reads green.

```sh
# locally
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name caiat-pg postgres:16
INVENTORY_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres" bun test
docker rm -f caiat-pg
```

See [`tests/README.md`](tests/README.md) for the full harness description.

---

## How this was built

I should be straightforward about this, because the repository makes it obvious anyway.

**This project was built with AI assistance**, using several tools:
[Lovable](https://lovable.dev) for the initial scaffold and much of the UI iteration, and
Codex/ChatGPT together with [Claude Code](https://claude.com/claude-code) for the hardening,
testing and review passes. `AGENTS.md`, `CLAUDE.md` and the commit history all reflect that.

My background is management and economics, not software engineering even though I always had interest in this area and I've always been curious about this area (specially if it involves AI too). What I brought to this
was mainly my problem solving ability skill, my vision and my knowledge working with AI models, such as tools, skills and some other "tweaks" but also how to write prompts following the best practices. I've also brought the domain and I specified the operational model, the roles, the data model and every
workflow from how a real 7-room guesthouse actually runs, and, increasingly as the project
went on, the engineering process around the generated code:

- **Continuous integration** that typechecks the application _and_ the test sources
  separately, builds for production, and runs the database suites on every pull request.
- **Database regression tests** against real migrations and real RPCs, targeted at the
  guarantees that are easy to break silently, for example, that a kitchen order deducts
  its ingredients exactly once even if the status transition is retried, which depends on a
  partial unique index, an `ON CONFLICT` target and an RPC all staying in agreement.
- **A security review pass** ([`20260914003000_security_review_hardening.sql`](supabase/migrations/20260914003000_security_review_hardening.sql))
  that moved sensitive state transitions server-side, revoked direct table writes on the
  tables that matter, and closed legacy write paths that had been left open.
- **Written engineering rules** in [`AGENTS.md`](AGENTS.md) that name payments, checkout,
  permissions/auth, cash reconciliation and inventory idempotency as high-risk areas
  requiring focused verification, so that neither I nor an assistant touches them casually.

The honest framing is that I directed, reviewed and hardened this system rather than typing
every line of it. I can explain the core workflows and the principal security decisions,
how a stay accumulates charges and closes out, why cash reconciliation is recomputed
server-side, why guest access is a validated token rather than an account. Treating AI
output as a draft that needs a test suite and a threat model around it, rather than as a
finished product is the main thing I learned building this.

---

## Known limitations

Written down deliberately, because a portfolio project that claims to be finished is not
credible.

- **No automated browser tests.** The suite covers database and pure TypeScript behaviour,
  but it does not render components or drive the critical UI flows. Hosted flows are checked
  manually; automated browser coverage of login → create stay → add charge → take payment →
  checkout remains the largest testing gap.
- **Lint is non-blocking in CI.** There is pre-existing lint debt from the scaffold, and
  `@typescript-eslint/no-unused-vars` is currently disabled. The rule is "do not add new
  errors in files you touch", which is a stopgap, not a standard.
- **Some files are too large.** `src/lib/i18n.tsx` (~2,800 lines) should be split into one
  data file per locale, and the larger route components (`stays.$id.tsx`, `stock.tsx`, both
  over 1,000 lines) should be broken into components.
- **The i18n mechanism is pragmatic rather than elegant.** A module-level current language
  plus a provider that remounts the subtree on change. It works, but switching language
  discards component state.
- **PayPal is implemented but not yet verified end-to-end.** The server-side order and
  capture flow is written and reviewed, but there is no automated test over it and no
  recorded Sandbox transaction, so end-to-end Sandbox verification is still pending. It has
  not been switched to live credentials, and the MAD→EUR conversion uses a fixed demo rate
  because PayPal Sandbox cannot settle in dirham. Both the MAD and the charged EUR amount
  plus rate are persisted for audit.
- **Offline support is awareness, not queueing.** There is no service worker, so the app is
  installable but not usable offline. Mutations are blocked while the browser reports itself
  offline, so nothing is silently lost, and the payloads are structured so a real offline
  queue could buffer them, but that queue has not been built.
- **Not yet in production use.** The app is complete enough to run a guesthouse day-to-day,
  but it has not been through a real season yet.

---

## Running it locally

### Prerequisites

- [Bun](https://bun.sh) 1.x
- A Supabase project (free tier is fine)
- Docker, if you want to run the database test suites

### Setup

```sh
git clone https://github.com/manel-miranda/caiat-portal.git
cd caiat-portal
bun install --frozen-lockfile
cp .env.example .env.local    # then fill in your own Supabase project values
bun run dev
```

**Local configuration:** `.env` is currently tracked in Git. Do not put secrets in it or
commit private configuration values. Use `.env.local`, which is covered by the existing
`*.local` ignore rule, for local overrides and any server-only secrets needed for testing.
Fill in all project-specific values so the local app uses your intended Supabase project.
Keep deployed secrets in your hosting provider's secret store, and never prefix a secret
with `VITE_`, which exposes it to the browser.

### Environment variables

| Variable                        | Where           | Purpose                                                                  |
| ------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`             | client          | Supabase project URL                                                     |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client          | Publishable (anon) key - public by design; RLS is what protects the data |
| `VITE_SUPABASE_PROJECT_ID`      | client          | Supabase project ref                                                     |
| `SUPABASE_URL`                  | server          | Same URL, for server routes                                              |
| `SUPABASE_PUBLISHABLE_KEY`      | server          | Same publishable key, for server routes                                  |
| `SUPABASE_PROJECT_ID`           | server          | Same project ref, for server routes                                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | **server only** | Bypasses RLS. Never expose this to the browser.                          |
| `PAYPAL_CLIENT_ID`              | server only     | Optional - online payment is disabled while unset                        |
| `PAYPAL_CLIENT_SECRET`          | server only     | Optional                                                                 |
| `PAYPAL_ENVIRONMENT`            | server only     | `sandbox` (default) or `live`                                            |

**Not currently required:** `LOVABLE_CRON_SECRET` and `LOVABLE_CRON_SECRET_PREVIOUS` appear
in `src/integrations/supabase/cron-auth.ts`, a Lovable auto-generated helper. That helper
(`authenticateCronRequest`) is **not imported anywhere** and this repository has no scheduled
or cron endpoints, so neither variable needs to be set for the application to work. They
would only become relevant if a cron-triggered server route were added and wired to that
helper, at which point `LOVABLE_CRON_SECRET` would hold the bearer token the scheduler
sends, and `LOVABLE_CRON_SECRET_PREVIOUS` would let an old secret keep working during a
rotation. They are deliberately left out of `.env.example` so they are not mistaken for
required configuration.

### Database

Apply the migrations in `supabase/migrations/` to your project, in filename order, using the
Supabase CLI or dashboard. Migrations are **additive and backward-compatible** by policy - see
[`AGENTS.md`](AGENTS.md).

### Shared formatting and code quality

Use Bun 1.4.2 and install dependencies with `bun install --frozen-lockfile`.
All contributors and AI tools follow `.editorconfig`, `.gitattributes`,
`.prettierrc`, and `eslint.config.js`. Text uses UTF-8 and LF endings; Prettier
uses two-space indentation, double quotes, semicolons, trailing commas, and a
100-character target width. These are shared conventions; ESLint also checks
React hooks and other code-quality rules.

Run `bun run format` after edits and `bun run check:full` before a PR.
`bun run format:check` checks formatting without changing files. VS Code users
can install the recommended extensions for formatting on save. Other editors
should enable EditorConfig and use the project's installed Prettier version.
Generated routes, Lovable-managed preview auth storage, lockfiles, and build
outputs are excluded from Prettier. Existing lint warnings remain visible;
formatting and lint errors fail CI.

Every contributor, including Lovable, must use a branch and PR for changes to
`main`. The `Main: PR and CI required` GitHub ruleset requires the GitHub Actions
checks `Typecheck and build` and `Database regression tests`, an up-to-date
branch, and resolved review conversations. No actor has bypass permission.
External review approval is optional so the solo maintainer can merge after CI.
Lovable must use a compatible branch/PR workflow; direct sync to `main` is blocked.
The Lovable build package and Vercel hosting remain in use unchanged.

### Available commands

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `bun run dev`       | Development server                                        |
| `bun run build`     | Production build                                          |
| `bun run typecheck` | Typecheck application and test sources                    |
| `bun run test`      | Test suites (database suites skip without a database URL) |
| `bun run lint`      | ESLint                                                    |
| `bun run check`     | `typecheck` + `build` - the pre-PR gate                   |
| `bun run format`    | Prettier                                                  |

---

## Project layout

```
src/
├── routes/
│   ├── index.tsx                 # Login
│   ├── guest.$token.tsx          # Tokenised guest portal (no account)
│   ├── api/public/paypal.*.ts    # Server-side PayPal order creation & capture
│   └── _authenticated/           # Staff app behind the auth guard
│       ├── home.tsx              #   Room board
│       ├── dashboard.tsx         #   Owner KPIs
│       ├── stays.*.tsx           #   Create / view / edit stays
│       ├── cash.tsx              #   Cash reconciliation
│       ├── stock.tsx             #   Inventory & purchases
│       ├── users.tsx             #   Roles & permissions
│       └── …
├── lib/                          # Data layer - one concern per module
│   ├── queries.ts / mutations.ts #   TanStack Query wrappers over RPCs
│   ├── permissions.ts            #   Client mirror of the server rules
│   ├── guest.ts                  #   Guest-portal RPC layer
│   ├── inventory.ts              #   Stock ledger helpers
│   ├── paypal.server.ts          #   Server-only PayPal helper
│   └── i18n.tsx                  #   EN / PT / FR / AR + RTL
├── components/                   # Feature components (ui/ is shadcn primitives)
└── integrations/supabase/        # Generated client + database types

supabase/migrations/              # 47 additive migrations - the real schema
tests/                            # Database regression suites (real Postgres, real RPCs)
docs/original-brief.md            # The original V1 specification
AGENTS.md                         # Engineering rules and high-risk areas
```

---

## Author

Built by **Manuel Miranda** - [GitHub](https://github.com/manel-miranda)

Built for a friend running a guesthouse in Morocco to try to help him on his daily tasks, and as a personal challenge and a way to learn more about software development while using and learning how to use and create AI Tools and AI Agents.
