# Caiat Operations

**An internal operations app for a 7-room guesthouse in Morocco** — rooms, stays, charges,
payments, cash reconciliation, kitchen orders and stock, built mobile-first for staff who
previously worked from paper and WhatsApp.

🔗 **Live instance:** [caiat-portal.lovable.app](https://caiat-portal.lovable.app) — the sign-in
screen and the guest portal are public; the staff app itself is behind a login, so the
screenshots below are the quickest way to see the inside.

---

## Contents

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

The guesthouse owner was running a 7-room property on paper, WhatsApp and memory, and
could not step away without losing visibility. Caiat Operations replaces the paper
without replacing the habits: it is deliberately small, mobile-first, and designed for
staff who are not comfortable with software.

### Staff

- **Room board** — all 7 rooms at a glance: available, occupied, arriving today, departing today.
- **Stays** — the core object. Create a stay against a guest and room, record the
  accommodation total, then attach charges, service requests and payments to it.
- **Charges & services** — a configurable catalogue (dinner, breakfast, transfer, laundry,
  activities…) with standard prices, so staff pick rather than type.
- **Requests** — guest requests with a scheduled time and a pending/completed/cancelled
  lifecycle. Completing a billable request offers to add the matching charge.
- **Payments** — cash, card or bank transfer, with the receiving user and timestamp
  recorded automatically. Cash payments are flagged as expected in the safe.
- **Checkout** — bill summary with total, paid and outstanding. Checkout is blocked while a
  balance is outstanding or a kitchen order is unfinished; an explicit admin override
  exists for genuine exceptions.
- **Kitchen orders & stock** — dish orders deduct ingredients from an inventory ledger via
  recipe components, with supplier and purchase tracking on the other side.

### Owner / admin

- **Dashboard** — occupancy, guests in house, revenue and payments recorded today,
  outstanding balances, cash expected in the safe, next-24h arrivals and departures, each
  with a drill-down.
- **Cash control** — cash payments for a business day grouped by employee, the expected
  safe total, an actual-count input and the resulting difference, saved as a closed
  reconciliation.
- **Users & permissions** — three roles (admin, supervisor, staff) with per-user permission
  overrides on top of role defaults.
- **Activity log** — an append-only audit trail of every significant action.
- **Stock simulation** — an admin testing tool that runs a simulated week of consumption
  through the real inventory ledger, so stock behaviour can be exercised before it matters.

### Guest

- A tokenised guest portal (`/guest/<token>`) with no account required: the guest sees their
  bill, their requests, a service catalogue, and can order from the kitchen or pay their
  outstanding balance online via PayPal.

### Throughout

- **PWA** — installable to the home screen with a web app manifest and an explicit install
  prompt, plus connectivity awareness that blocks mutations while offline rather than losing
  them silently. (There is no service worker yet, so it is installable but not offline-capable.)
- **Four languages** — English, Portuguese, French and Arabic, including full RTL layout.
- **MAD-native** — Moroccan dirham is the accounting currency throughout, with
  `Africa/Casablanca` as the business day boundary.

---

## Screenshots

<!--
  TO ACTIVATE: drop the PNGs into docs/screenshots/ using the filenames below, then delete
  this comment block's opening and closing markers so the table renders.
  See docs/screenshots/README.md for the exact shot list and recommended viewport.

| | |
|---|---|
| ![Room board](docs/screenshots/room-board.png)<br>**Staff room board** — the 7 rooms at a glance | ![Stay detail](docs/screenshots/stay-detail.png)<br>**Stay detail** — bill, requests and actions |
| ![Owner dashboard](docs/screenshots/dashboard.png)<br>**Owner dashboard** — KPIs with drill-down | ![Cash control](docs/screenshots/cash-control.png)<br>**Cash control** — expected vs. counted |
| ![Guest portal](docs/screenshots/guest-portal.png)<br>**Guest portal** — bill and catalogue, no login | ![Stock](docs/screenshots/stock.png)<br>**Stock** — inventory ledger and purchases |
-->

> _Screenshots pending — see [`docs/screenshots/README.md`](docs/screenshots/README.md)._

---

## Tech stack

| Layer           | Choice                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Framework       | [TanStack Start](https://tanstack.com/start) (full-stack React, file-based routing + server routes) |
| UI              | React 19, TypeScript, Tailwind CSS 4, [shadcn/ui](https://ui.shadcn.com) on Radix primitives        |
| Data            | TanStack Query for client cache, TanStack Router for routing                                        |
| Backend         | [Supabase](https://supabase.com) — PostgreSQL, Auth, Row Level Security                             |
| Payments        | PayPal REST Orders v2 (sandbox), captured server-side                                               |
| Build / runtime | Vite 8, [Bun](https://bun.sh)                                                                       |
| CI              | GitHub Actions — typecheck, build, and database regression tests on a real PostgreSQL service       |

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
and an append-only audit log — 25 tables across 47 additive migrations.

**Mutations go through RPCs, not table writes.** Anything with a rule attached — creating a
stay, checking out, reconciling cash, completing a request, consuming inventory — is a
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
clearest example — the browser submits **only the physical count**:

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
carries per-user grants and revocations. Three keys — `users_manage`, `roles_manage`,
`pin_reset` — are admin-only and not grantable at all.

`has_permission(uid, key)` in the database is the single enforcement point.
`src/lib/permissions.ts` mirrors the same rules on the client **only so the UI can hide what
the server would refuse anyway** — it grants nothing.

### Hardened function definitions

Every `SECURITY DEFINER` function pins `SET search_path TO 'public'` and revokes execution
from `PUBLIC` and `anon`, granting it explicitly to `authenticated` and `service_role`:

```sql
REVOKE ALL ON FUNCTION public.cash_reconcile(date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cash_reconcile(date, numeric, text) TO authenticated, service_role;
```

Without the pinned `search_path`, a definer function is vulnerable to schema-shadowing
privilege escalation — a subtle failure mode that is easy to miss and expensive to discover
late.

### Payments

PayPal orders are created and captured entirely server-side. On return, the handler
verifies that PayPal reports `COMPLETED`, that the captured **amount and currency match
what was recorded** for the payment session, and only then records a payment. Duplicate
capture is impossible: `payments.external_reference` carries a unique index, so a refreshed
return URL is a no-op.

```ts
// src/routes/api/public/paypal.return.ts
const ok =
  result.status === "COMPLETED" &&
  result.captureId !== null &&
  result.currency === session.charged_currency &&
  Math.abs((result.amount ?? 0) - expected) < 0.01;
```

No query parameter from the redirect is trusted. The PayPal credentials live in server-side
environment variables and are never shipped to the browser or logged.

### Auditability

`audit_log` rows are written by the RPCs themselves, not by the client, so the trail cannot
be skipped by going around the UI. Every significant action carries the acting user, the
timestamp and the affected entity.

---

## Testing strategy

The guarantees in this application live in the database, so that is where the tests are.

**14 suites, ~3,400 lines, no mocks.** Each suite creates a throwaway PostgreSQL database,
applies a small prelude plus **every real file in `supabase/migrations`**, and then calls
the **real RPCs** as users with real roles and permissions. No hosted Supabase project is
contacted and nothing is stubbed — if a migration breaks a permission boundary, the test
fails.

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
which turns "no database available" into a **failure** rather than a silent skip — a
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

**This project was built with heavy AI assistance** — [Lovable](https://lovable.dev) for the
initial scaffold and much of the UI iteration, and [Claude Code](https://claude.com/claude-code)
for the hardening, testing and review passes. `AGENTS.md`, `CLAUDE.md` and the commit history
all reflect that.

My background is management and economics, not software engineering. What I brought to this
was the domain — I specified the operational model, the roles, the data model and every
workflow from how a real 7-room guesthouse actually runs — and, increasingly as the project
went on, the engineering process around the generated code:

- **Continuous integration** that typechecks the application _and_ the test sources
  separately, builds for production, and runs the database suites on every pull request.
- **Database regression tests** against real migrations and real RPCs, targeted at the
  guarantees that are easy to break silently — for example, that a kitchen order deducts
  its ingredients exactly once even if the status transition is retried, which depends on a
  partial unique index, an `ON CONFLICT` target and an RPC all staying in agreement.
- **A security review pass** ([`20260914003000_security_review_hardening.sql`](supabase/migrations/20260914003000_security_review_hardening.sql))
  that moved sensitive state transitions server-side, revoked direct table writes on the
  tables that matter, and closed legacy write paths that had been left open.
- **Written engineering rules** in [`AGENTS.md`](AGENTS.md) that name payments, checkout,
  permissions/auth, cash reconciliation and inventory idempotency as high-risk areas
  requiring focused verification — so that neither I nor an assistant touches them casually.

The honest framing is that I directed, reviewed and hardened this system rather than typing
every line of it. I can explain any design decision in it, which is the part that actually
matters. Treating AI output as a draft that needs a test suite and a threat model around it —
rather than as a finished product — is the main thing I learned building this.

---

## Known limitations

Written down deliberately, because a portfolio project that claims to be finished is not
credible.

- **No frontend tests.** All 14 suites are database-level. There are no component tests and
  no end-to-end coverage of the critical UI flows. This is the largest gap, and Playwright
  coverage of login → create stay → add charge → take payment → checkout is the next thing
  on the list.
- **Lint is non-blocking in CI.** There is pre-existing lint debt from the scaffold, and
  `@typescript-eslint/no-unused-vars` is currently disabled. The rule is "do not add new
  errors in files you touch" — which is a stopgap, not a standard.
- **Some files are too large.** `src/lib/i18n.tsx` (~2,800 lines) should be split into one
  data file per locale, and the larger route components (`stays.$id.tsx`, `stock.tsx`, both
  over 1,000 lines) should be broken into components.
- **The i18n mechanism is pragmatic rather than elegant.** A module-level current language
  plus a provider that remounts the subtree on change. It works, but switching language
  discards component state.
- **PayPal is sandbox-only.** The integration is complete and correct, but it has not been
  switched to live credentials, and the MAD→EUR conversion uses a fixed demo rate because
  PayPal sandbox cannot settle in dirham. Both the MAD and the charged EUR amount plus rate
  are persisted for audit.
- **Offline support is awareness, not queueing.** There is no service worker, so the app is
  installable but not usable offline. Mutations are blocked while the browser reports itself
  offline, so nothing is silently lost, and the payloads are structured so a real offline
  queue could buffer them — but that queue has not been built.
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
cp .env.example .env    # then fill in your Supabase project values
bun run dev
```

### Environment variables

| Variable                        | Where           | Purpose                                                                  |
| ------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`             | client          | Supabase project URL                                                     |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client          | Publishable (anon) key — public by design; RLS is what protects the data |
| `VITE_SUPABASE_PROJECT_ID`      | client          | Supabase project ref                                                     |
| `SUPABASE_URL`                  | server          | Same URL, for server routes                                              |
| `SUPABASE_PUBLISHABLE_KEY`      | server          | Same publishable key, for server routes                                  |
| `SUPABASE_PROJECT_ID`           | server          | Same project ref, for server routes                                      |
| `SUPABASE_SERVICE_ROLE_KEY`     | **server only** | Bypasses RLS. Never expose this to the browser.                          |
| `PAYPAL_CLIENT_ID`              | server only     | Optional — online payment is disabled while unset                        |
| `PAYPAL_CLIENT_SECRET`          | server only     | Optional                                                                 |
| `PAYPAL_ENVIRONMENT`            | server only     | `sandbox` (default) or `live`                                            |

### Database

Apply the migrations in `supabase/migrations/` to your project, in filename order, using the
Supabase CLI or dashboard. Migrations are **additive and backward-compatible** by policy — see
[`AGENTS.md`](AGENTS.md).

### Commands

| Command             | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `bun run dev`       | Development server                                        |
| `bun run build`     | Production build                                          |
| `bun run typecheck` | Typecheck application and test sources                    |
| `bun run test`      | Test suites (database suites skip without a database URL) |
| `bun run lint`      | ESLint                                                    |
| `bun run check`     | `typecheck` + `build` — the pre-PR gate                   |
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
├── lib/                          # Data layer — one concern per module
│   ├── queries.ts / mutations.ts #   TanStack Query wrappers over RPCs
│   ├── permissions.ts            #   Client mirror of the server rules
│   ├── guest.ts                  #   Guest-portal RPC layer
│   ├── inventory.ts              #   Stock ledger helpers
│   ├── paypal.server.ts          #   Server-only PayPal helper
│   └── i18n.tsx                  #   EN / PT / FR / AR + RTL
├── components/                   # Feature components (ui/ is shadcn primitives)
└── integrations/supabase/        # Generated client + database types

supabase/migrations/              # 47 additive migrations — the real schema
tests/                            # Database regression suites (real Postgres, real RPCs)
docs/original-brief.md            # The original V1 specification
AGENTS.md                         # Engineering rules and high-risk areas
```

---

## Author

Built by **Manel Miranda** — [GitHub](https://github.com/manel-miranda)

Built for a friend running a guesthouse in Morocco, and as a way to learn what it actually
takes to ship software that handles other people's money.
