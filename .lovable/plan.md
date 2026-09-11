# Customers database + Users, roles & PIN management

## What the team gets

**Customers**
- A new **Customers** page (all signed-in users) with search by name, phone or email, showing each person's number of stays, last stay date and a New / Returning tag.
- A **customer profile** page: contact details, first and last stay, total stays, total billed and total paid, the full chronological list of stays linked to each booking, and internal notes only staff can see.
- **New stay** gets a customer step: search an existing customer and pick them (the booking attaches to that same person, no duplicate created) or create a new one with just a name, optionally phone/email. Picking an existing customer shows "Returning · 2 previous stays · last stayed 12 Aug" right away.
- **Stay detail** shows "New customer" or "Returning customer · 3 stays" linking to the profile.
- Same-name people are never merged automatically. Existing bookings and history keep working untouched.
- The guest QR portal stays exactly as private as today: first name only, no contact details, no history.

**Users, roles and PINs**
- New **Supervisor** role between Staff and Admin. Ahmed becomes Supervisor.
- Admin-only **Users & Permissions** page: everyone listed with name, username, role, active/inactive and what they are allowed to do. Admins can change a role, switch individual permissions on or off, deactivate/reactivate someone, reset a PIN, and add a new user.
- PIN reset never reveals the old PIN. The admin types a new 6-digit PIN or taps **Generate PIN**, and the generated PIN is shown once, right then, to hand over.
- Everyone signed in gets a **Change my PIN** action.
- Role changes, permission changes, activation changes and PIN resets are all written to the history log — never the PIN itself.
- The system refuses to leave itself with zero admins.

### Permission defaults

| Permission | Staff | Supervisor | Admin |
|---|---|---|---|
| reservations_manage (create/edit/confirm/reject) | no | yes | yes |
| payments_manage (charges & payments) | yes | yes | yes |
| checkout_override | no | yes | yes |
| cash_reconcile | no | yes | yes |
| customers_manage (edit profile & notes) | no | yes | yes |
| guest_access_manage (QR links) | no | yes | yes |
| requests_manage | yes | yes | yes |
| activity_view (history log) | no | yes | yes |
| users_manage / roles_manage / pin_reset | admin only, never grantable |

Admins can grant or revoke any of the first eight per person; the last three stay admin-only.

## Technical plan

### Migrations (forward only, no data rewritten)

1. **Enum migration (own transaction):** `ALTER TYPE app_role ADD VALUE 'supervisor';` alone, so later functions can compare against it.
2. **Customers:** `guests` already carries phone, email, nationality and notes — reuse it as the customer entity, no new table. Add index on lower(full_name), phone, email for search. `guests` write access moves behind `public.customer_upsert(...)` / `customer_update_profile(...)` SECURITY DEFINER RPCs (`SET search_path TO 'public'`) that require `has_permission(auth.uid(),'customers_manage')`; table-level SELECT stays open to authenticated, direct INSERT/UPDATE/DELETE revoked. No anon grants added anywhere.
3. **Permissions:** `public.user_permissions(user_id, permission text, granted boolean)` with GRANTs (`SELECT` to authenticated, `ALL` to service_role), RLS: authenticated read, no direct writes. `public.role_default_permission(app_role, text) -> boolean` and `public.has_permission(_user_id uuid, _key text) -> boolean` (STABLE, SECURITY DEFINER, fixed search_path) = admin ⇒ true for everything; otherwise override if present, else role default; the three security keys always require the admin role.
4. **Profiles:** already has `active`. Add `public.set_user_role`, `public.set_user_permission`, `public.set_user_active` SECURITY DEFINER RPCs — each requires `has_role(auth.uid(),'admin')`, refuses to remove the last admin, refuses to grant the three protected keys, and writes an `audit_log` row.
5. **Existing RPCs updated (CREATE OR REPLACE, same signature where possible):** `edit_stay`, `confirm_reservation`, `reject_reservation`, `checkout_stay` override branch, `guest_token_generate` / `guest_token_revoke` swap `has_role(...,'admin')` for `has_permission(..., '<key>')`. `cash_reconciliations` RLS policy switches to `has_permission(auth.uid(),'cash_reconcile')`.
6. **`create_stay_with_guest` gains `p_guest_id uuid DEFAULT NULL`** — when supplied and it exists, the stay links to that customer row and no guest is inserted; otherwise unchanged behaviour. Creation/edit now require `reservations_manage`.
7. **Ahmed → supervisor** applied as a data statement after the enum migration; no other real user touched.

### PIN reset and user creation

Supabase Auth admin calls cannot happen client-side, so these run as authenticated server functions in `src/lib/users.functions.ts` (`requireSupabaseAuth`, then verify the caller is admin through `context.supabase.rpc('has_role', ...)`, then `await import('@/integrations/supabase/client.server')` inside the handler):
- `resetUserPin` — validates 6 digits, `supabaseAdmin.auth.admin.updateUserById`, audits `user.pin_reset` with no value. Generation happens on the server; the plaintext is returned once in the response and never stored.
- `changeMyPin` — the signed-in user updates their own PIN via `supabase.auth.updateUser`, no admin path needed.
- `createUser` — creates the auth user with a confirmed `<username>@caiat.local` identity, inserts profile + role row, audits.
- `setUserActive` also disables sign-in through `updateUserById({ ban_duration })` so an inactive user genuinely cannot log in.

### App code

- `src/lib/permissions.ts` — permission keys, role defaults mirrored client-side for UI, `usePermission()` reading a single `user_permissions` + role query; `src/lib/auth.tsx` extended with `role` and effective permissions. `src/lib/admin-guard.ts` gains `requirePermission(key)`.
- Replace scattered `isAdmin` checks in `stays.$id.tsx`, `stays.$id_.edit.tsx`, `dashboard.tsx`, `cash.tsx`, `activity.tsx`, `GuestAccessCard.tsx`, `AppShell.tsx` nav with permission checks. Backend enforcement is the migrations above; the UI only mirrors it.
- New routes: `_authenticated/customers.tsx`, `_authenticated/customers.$id.tsx`, `_authenticated/users.tsx` (admin-only).
- `src/lib/customers.ts` — list/search/detail queries and stay-count aggregation; `stays.new.tsx` gains the customer picker; `mutations.ts` gains customer + admin mutations with audit entries.
- `src/lib/realtime.ts` — add `user_permissions`, `user_roles`, `profiles` keys.
- `src/lib/i18n.tsx` — new EN/PT/FR/AR keys; layout already uses logical properties so RTL holds.

### Verification
- `tsgo` typecheck and production build.
- Backend tests in rolled-back transactions: permission resolution per role, override precedence, protected keys not grantable, last-admin protection, stay creation with an existing `p_guest_id` creating no duplicate guest, supervisor allowed to confirm/edit, staff denied, anon still blocked from `guests`/`user_permissions`.
- Temporary QA user for the PIN reset round trip (old PIN fails, new PIN works), then deleted.
- Browser pass at 390px and desktop, EN and Arabic, if a session can be minted; otherwise reported as unverified.
- Ahmed left as Supervisor. Nothing published.
