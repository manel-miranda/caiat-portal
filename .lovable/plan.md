# Edit Stay (admin only) + realtime/task QA

## What owners get

Bernardo, Cristiana and Manel get an **Edit** button on a stay's page. It opens a form with the same look and room/price helpers as the New Stay screen, where they can correct: guest name, room, arrival, departure, number of guests, where the booking came from, the accommodation amount and notes.

Staff see the stay exactly as today, with no Edit button.

Rules kept safe:
- Editing is allowed for confirmed active stays and for pending requests. Finished, cancelled and rejected bookings stay read-only (no reopen is invented).
- Charges, payments, guest requests, history and the booking's identity are untouched.
- For confirmed stays, the room/date change is refused if another confirmed booking already holds that room for those nights (the current stay itself is excluded). Pending requests may overlap, because they don't hold a room until accepted.
- If the price inputs change, the app shows a suggested amount with a "use this" action; it never silently overwrites an amount typed by hand.
- Every edit is written to the history log as "stay updated" with the fields that changed, before and after, and who did it.

## Technical plan

### Database (one migration)
`public.edit_stay(...)` — SECURITY DEFINER, `SET search_path TO 'public'`, EXECUTE revoked from PUBLIC/anon, granted to authenticated + service_role. Table-level writes on `stays` stay revoked. Inside:
- `auth.uid()` present and `has_role(uid,'admin')`, else `AUTH_REQUIRED` / `ADMIN_REQUIRED`
- `SELECT ... FOR UPDATE` the stay; refuse when `status <> 'active'` or `confirmation_status = 'rejected'` (`STAY_NOT_EDITABLE`)
- validate: guest name non-empty, `check_out > check_in`, guests >= 1 and <= room capacity, total >= 0, room exists — reusing the same error codes as `create_stay_with_guest` (`ROOM_CAPACITY`, `CHECKOUT_AFTER_CHECKIN`, ...)
- only when `confirmation_status = 'confirmed'`: `pg_advisory_xact_lock` on the room, then overlap check against other confirmed non-cancelled stays with `check_in < p_check_out AND check_out > p_check_in AND id <> p_stay_id` → `ROOM_CONFLICT`
- `UPDATE public.guests SET full_name = ...` on the stay's existing `guest_id` (no new guest row), then `UPDATE public.stays SET ...`
- returns the stay id

### App code
- `src/lib/mutations.ts` — `updateStay(...)` calling the RPC, mapping errors through the existing `stayErrorMessage`, plus `logAudit(..., "stay.updated", "stay", id, { changed })` with a before/after diff computed client-side from the loaded row.
- `src/routes/_authenticated/stays.$id.edit.tsx` — new admin-only route (`beforeLoad: requireAdmin`) reusing the New Stay field layout: room grid with rate hint, dates, guests, source buttons, total with suggested-total hint and an "use suggested" button, notes. Cancel returns to the stay.
- `src/routes/_authenticated/stays.$id.tsx` — Edit button in the header area, rendered only for admins and only for editable stays.
- `src/lib/i18n.tsx` — new keys (`editStay`, `saveChanges`, `stayUpdated`, `useSuggested`, `suggestedTotal`, `stayNotEditable`, `cancel` if absent) in en/pt/fr/ar; RTL unaffected since layout classes already use logical properties.

### QA fix found during inspection
`src/lib/realtime.ts` subscribes to stays/charges/payments/requests/cash_reconciliations but **not `guests`**. A guest-name edit alone would not refresh other tabs. Adding `guests: [["stays"],["stay"],["requests"]]` fixes it. Task-bell query keys are otherwise consistent (prefix invalidation of `["stays"]` covers `["stays","pending"]` and `["stays","active"]`).

### Verification
- `tsgo` typecheck + production build.
- Backend tests inside rolled-back transactions: valid date change, invalid dates, over-capacity, conflict with another confirmed stay, pending stay allowed to overlap, staff caller denied, admin caller succeeds, direct authenticated `UPDATE stays` still denied.
- Browser check of the Edit button and cross-tab refresh if a session can be minted; otherwise reported as unverified.
- No persistent QA data; nothing published.
