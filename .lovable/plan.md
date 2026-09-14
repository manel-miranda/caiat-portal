# Caiat Operations — simplicity audit (read-only, no changes made)

Grounded in the current code: `AppShell.tsx`, `MobileMenu.tsx`, `TaskBell.tsx`, `home.tsx`, `requests.tsx`, `calendar.tsx`, `stays.$id.tsx` (924 lines), `stays.new.tsx`, `services.tsx`, `customers*.tsx`, `dashboard.tsx`, `cash.tsx`, `activity.tsx`, `stock.tsx` (1029 lines), `catalogue.tsx` (753 lines), `users.tsx`, `guest.$token.tsx` + guest components.

## 1. What is already simple — preserve

- Room grid on Home: 7 colour-coded cards, tap an occupied room to open the stay, tap a free room to start a booking with the room pre-filled (`home.tsx:85-128`). This is the single best thing in the app.
- Three counters + a "Today" list (arrivals / departures / pending) directly under the grid — the whole daily picture without scrolling into menus.
- Big segmented button grids instead of dropdowns (room, source, payment method, service) — thumb-friendly, no hidden state.
- One stay = one page with bill, payments, requests and four large actions.
- Checkout blocks unpaid departure by default and only offers an override to those entitled (`stays.$id.tsx:426-481`).
- Guest portal needs no login, is one scroll, and fails closed on a bad token.
- Offline banner and action blocking when the connection drops.

## 2. Ten biggest sources of perceived complexity (ranked)

1. **Too many destinations.** Desktop nav shows up to 8 tabs; mobile shows 4 + More with 8 more entries. An admin can reach 14 screens. Bernardo's first impression is formed here.
2. **The More sheet mixes everything.** Account, language, currency, Customers, Services, Cash, Activity, Catalogue, Users, Stock, Sign out — settings and management in one undifferentiated list (`MobileMenu.tsx:41-162`).
3. **Three ways to do the same job.** A charge can be added from Stay detail, from Services (quick-charge against a selected stay), and implicitly from completing a billable request. A request can be created from Stay detail, from Services, or by the guest. Nothing tells staff which is "the" way.
4. **Requests screen carries two mental models at once.** Food orders (multi-step status: requested → accepted → preparing → delivered) and simple requests (complete / cancel) share one list, plus three filter chips and a section called "Activity" that is really request history (`requests.tsx:105-191`).
5. **Stay detail is long and flat.** Header, bill, payments, requests, guest-access/QR card, then four equally weighted actions. Nothing marks the common daily case (add charge) versus the rare one (checkout with override).
6. **New stay asks for too much in one screen.** Customer search, name, phone, email, duplicate-suggestion panel, room grid, two dates, guests, accommodation total, 6 sources, a "Confirmed vs Pending request" toggle, notes — around 12 decisions for a walk-in (`stays.new.tsx:191-458`).
7. **Management vocabulary inside daily work.** "Confirmation status", "Admin override", "Possible duplicates / Merge customers", "Expected in safe / Difference / Discrepancy", "Billable only", "Requestable", "Demo". Several appear on screens ordinary staff use.
8. **Stock is the heaviest screen in the app.** Three tabs, three status counters, search + 4 filter chips, four row actions (Receive / Adjust / Waste / History), plus Purchases, Purchase lines, Suppliers and prefill — all visible to every signed-in staff member with no route gate (`stock.tsx`).
9. **Services doubles as a brochure and an action surface.** Six category groups, an "Included" section, price + Requestable/Billable tags, difficulty and activity-mode metadata, and per-item buttons that silently do nothing until a stay is chosen in a dropdown at the top (`services.tsx:120-224`).
10. **Two overlapping notification surfaces.** TaskBell groups stays/requests/reservations/food orders/low stock; Home's counters and Dashboard's "Next 24h" repeat much of the same, with different counting rules. Numbers that disagree read as unreliable.

## 3. Screen-by-screen verdict

| Screen | Verdict | Why |
| --- | --- | --- |
| Home / Rooms | KEEP AS-IS | The clearest screen; only trim price/capacity micro-text on room cards. |
| Requests | SIMPLIFY | Drop the filter chips until volume needs them; rename "Activity" to "Done today"; keep food orders but visually separate. |
| Calendar | SIMPLIFY | Month grid + room filter + legend + 4-group agenda is a lot; the agenda alone covers most staff use. |
| Stay detail | REDESIGN | Right content, wrong hierarchy: one primary action, the rest secondary; move the QR card and bill history behind disclosure. |
| New stay | SIMPLIFY | Two steps (who + which room/dates, then money/source/notes) or sensible defaults for source and booking status. |
| Services | HIDE-DEEPER | Keep as reference under More; the action buttons duplicate Stay detail and mislead without a selected stay. |
| Customers | KEEP AS-IS (list) | Search + history is genuinely simple. |
| Customer detail | SIMPLIFY | Move "Possible duplicates / Merge" behind an admin-only disclosure; it is data admin, not guest info. |
| Dashboard | SIMPLIFY | Good for Bernardo; the quick-link pill row duplicates navigation and can go. |
| Cash | KEEP AS-IS | Focused, single-purpose, already gated. |
| Activity (audit) | HIDE-DEEPER | Correct to keep, wrong to list as a peer destination; reach it from Dashboard only. |
| Stock | HIDE-DEEPER + SIMPLIFY | Default view should be the shopping list; Receive/Adjust/Waste collapse into one "Update stock" action; Purchases/Suppliers behind a manager entry. |
| Purchases / Suppliers | HIDE-DEEPER | Grocery-run bookkeeping, not daily staff work. |
| Catalogue | KEEP AS-IS | Already admin-only and correctly out of the daily path. |
| Users & permissions | KEEP AS-IS | Admin-only; "Change my PIN" should live only in Account, not duplicated here. |
| More menu | REDESIGN | Split into Settings (account, language, currency, sign out) and Manage (permission-gated). |
| TaskBell | SIMPLIFY | One source of truth for "what needs doing"; drop stock from it for staff. |
| Guest portal | SIMPLIFY | Menu + 3D demo + generic request picker + requests + bill + pay is a long scroll; the 3D "Demo" block reads unfinished. |

## 4. Proposed mobile information architecture

**Ordinary staff (4 tabs, no More management entries)**
Rooms · Requests · Calendar · Menu(settings only). Everything else reachable contextually from a room or stay. Stock only if they actually shop.

**Supervisor**
Same four tabs + Manage section in the menu: Stock, Customers, Services, Cash (if granted). No Catalogue, no Users.

**Admin / Bernardo**
Today (dashboard) · Rooms · Requests · Calendar · Manage. Manage holds Cash, Stock & purchases, Customers, Services, Catalogue, Users, Activity.

## 5. Top five changes with the biggest simplicity gain

1. Split the More sheet into **Settings** and **Manage**, and hide Manage entirely for staff with no management permission.
2. Give Stay detail **one primary action** (Add charge) with Payment / Request / Checkout as a secondary row, and collapse the QR card.
3. Make **Stock open on the shopping list**, merge Receive/Adjust/Waste into a single "Update stock" sheet, and move Purchases/Suppliers behind a manager entry.
4. Reduce **New stay** to the essentials on first screen, with source defaulting to Walk-in and booking status defaulting to Confirmed (revealed only when relevant).
5. Replace management vocabulary with plain words throughout: "Needs approval" instead of confirmation status, "Allow leaving with unpaid balance" instead of Admin override, "Same guest?" instead of Possible duplicates / Merge.

## 6. First implementation batch (one focused PR)

Frontend/presentation only, no schema, no permission changes:

- Restructure `MobileMenu.tsx` into Settings and Manage groups; hide Manage when the user has no management permission.
- Remove Services and Activity from the staff-visible nav path (keep routes and admin access intact).
- Re-rank Stay detail actions: one primary, three secondary; collapse `GuestAccessCard` behind a "Guest link" toggle.
- Remove the Dashboard quick-link pill row (duplicates navigation).
- Rename the Requests "Activity" heading to "Done today" and drop the filter chips while volume is low.
- New EN/PT/FR/AR strings for every renamed label.

Estimated blast radius: 5 files, no database work, fully reversible.

## 7. Do not change until Bernardo has been observed using it

- Home's room grid and counter layout — it is likely the part he already understood.
- Calendar structure — we do not yet know whether he plans by month or by day.
- Food-order status chain (requested → accepted → preparing → delivered) — needs real kitchen use before shortening.
- Whether Stock belongs to staff at all, or only to whoever shops.
- Checkout's unpaid-balance guard and the override — safety behaviour; change only with evidence.
- Whether the guest portal's 3D/AR block should stay, be polished, or be removed.
- Any permission defaults or role boundaries — those are backend-enforced and should follow observed behaviour, not guesses.
