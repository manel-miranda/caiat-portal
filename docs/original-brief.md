# Original product brief

This is the original specification that kicked off the project: the written brief for
V1 of Caiat Operations, covering scope, roles, data model, required screens and the
visual direction.

It is kept here unchanged as a record of what was actually specified up front, and as
a reference point for how far the implementation has drifted from (and grown beyond)
the initial scope. It is **not** current documentation — see the
[README](../README.md) for what the application does today.

---

# Caiat Portal

Build a working mobile-first full-stack web app called “Caiat Operations” for a small 7-room guesthouse/hotel in Morocco. This is an internal operations app, not a marketing website. The goal is to let the hotel operate without the owner constantly supervising while still giving him real-time visibility.

Core principles:

- Extremely simple UX for staff used to paper and WhatsApp.
- Mobile-first, responsive, PWA-friendly.
- Preserve existing habits; do not replace WhatsApp in V1.
- Keep V1 small and operational, not a full PMS/ERP.
- Default full-stack TypeScript stack with Tailwind + shadcn/ui.
- Currency: Moroccan dirham (MAD).
- Structure copy/localization so French, Arabic and English can be added easily later.

Roles:

1. Owner/Admin (Bernardo): management dashboard, cash reconciliation, all stays, payments and activity.
2. Staff: rooms, arrivals/departures, guest stays, requests, charges, payments and checkout. Staff should not see management analytics they don't need.

Authentication:

- Simple username/phone + PIN-style login UX, implemented securely.
- Every action attributable to an individual user.

Data model/entities:
users, rooms, guests, stays, service_types, charges, requests, payments, cash_reconciliations, audit_log.
Guest -> Stay -> Room, Charges, Requests, Payments. Stay is the core object.

Reservation sources in V1: Booking.com, WhatsApp, Phone, Email, Walk-in, Other. No Booking.com API integration yet; manual creation is fine.

Required screens/flows:

1. Login: Caiat title, username/phone, PIN, enter.
2. Staff Home: 7-room grid/list with status Available / Occupied / Arrival Today / Departure Today, guest short info, and compact Today area with arrivals, departures, pending requests. Large touch targets and minimal text.
3. Create Stay: guest name, room, arrival, departure, guests, source, accommodation total MAD, notes.
4. Stay Detail: room, guest, dates/nights, source, guests, bill breakdown, total/paid/outstanding, requests, actions Add Charge / Add Request / Add Payment / Checkout.
5. Add Charge: Dinner, Breakfast, Transfer, Activity, Extra night, Laundry, Other; quantity, unit/total price, optional notes. Use configurable standard prices via service_types.
6. Requests: room/stay, type, requested date/time, notes, status pending/completed/cancelled. Pending requests visible on staff home and stay detail. When completing normally billable requests, optionally ask whether to add the configured charge. Do not integrate WhatsApp yet, but keep the architecture ready for later notifications.
7. Payments: stay/room, amount, method Cash/Card/Bank Transfer, receiving user and timestamp automatic. Cash payments flagged as expected in safe. Clear confirmation.
8. Cash Control (Admin): selected date, cash payments grouped by employee, expected safe amount, actual cash count input, automatic difference, save/close reconciliation, clear discrepancy if non-zero.
9. Checkout: bill summary, total, paid, outstanding; warning and Record Payment if outstanding > 0; prevent accidental unpaid checkout by default; explicit admin override for exceptions; mark stay completed and room available.
10. Owner Dashboard: occupancy x/7, guests currently staying, revenue recorded today, payments received today, outstanding active balances, cash expected in safe, arrivals, departures, pending requests, next-24h arrivals/departures/scheduled requests. Drill-down links/cards.
11. Auditability: important actions log user, timestamp, action, relevant stay/payment/request.
12. Connectivity resilience: PWA-friendly lightweight app; sensible app-shell caching; structure mutations so offline queue/sync can be added next. If practical, add a basic queued-action UX for temporary connection loss, but do not over-engineer.

Seed/demo data:

- 7 rooms
- Bernardo admin account + at least 2 demo staff accounts
- a few active stays, one arrival, one departure
- example charges, payments, requests and cash records
  Make it immediately explorable.

Visual direction:

- modern, calm, clean hospitality UI
- simple enough for low-tech users
- large rounded cards/buttons
- excellent contrast/readability
- no unnecessary charts for staff
- owner dashboard can use compact KPI cards but avoid clutter
- mobile viewport should feel like a native app

Please build the working application, not just mockups. Verify the main flows end-to-end and fix obvious issues before finishing. Do not add features outside this V1 scope unless necessary for the required flows.
