# Dashboard KPI drill-downs

## Goal
Make the six existing dashboard KPI cards open clear, responsive breakdowns without changing navigation, permissions, data loading, or backend behavior.

## Implementation
- Extend the existing KPI card component so actionable cards are keyboard-accessible buttons with focus styling and a subtle RTL-aware chevron.
- Add one reusable dashboard detail sheet using the existing Radix sheet primitives. It will provide a translated title, date/scope, visible close action, focus trapping/return, and a scrollable mobile/desktop layout.
- Keep all six dashboard totals exactly as currently calculated, while moving selection and aggregation into small pure helpers that can be regression-tested.
- Populate each breakdown only from data already loaded by the dashboard:
  - **Occupancy:** the exact in-house stay set used by the KPI, with guest, room, dates, stay links, and available rooms shown separately.
  - **Guests:** the same in-house stays, each guest count, and the matching total.
  - **Revenue:** today’s confirmed arrivals at their full accommodation amount, plus today’s charge rows; show subtotals and the existing total, with explicit wording that this is neither nightly revenue nor cash received.
  - **Payments:** every payment loaded for today, grouped by method, with time, amount, and a stay link. Active stays show known guest/room context; other stays retain a neutral translated “Open stay” link.
  - **Cash:** only today’s cash payments, explain that the figure is not a cumulative safe balance, and provide a prominent Cash control link. Keep the existing `cash_reconcile` visibility gate on both card and detail content.
  - **Outstanding:** active stays with positive balances, descending by outstanding amount, showing bill total, paid, and outstanding with stay links; overpayments remain zero outstanding as today.
- Remove the current link wrapper around the Cash KPI so no nested interactive controls are created.
- Add all new labels, explanations, scopes, and empty states in English, Portuguese, French, and Arabic through the existing localization system.
- Leave every lower dashboard section unchanged.

## Regression coverage
Add focused Bun unit tests for the pure dashboard breakdown helpers, covering:
- checkout-day, future, and pending stays excluded from occupancy;
- guest and occupancy totals matching their selected rows;
- accommodation/extras revenue subtotals and empty data;
- completed or otherwise absent stays retained in payments;
- mixed payment methods and cash-only selection;
- outstanding sorting, overpayment clamping, and empty data.

## Verification
- Run `bun install --frozen-lockfile`.
- Run `bun run typecheck`, `bun run build`, `bun test`, and `bun run lint`.
- Review any lint findings in touched files and distinguish unrelated baseline failures.
- Exercise all six sheets at desktop and mobile widths, including keyboard open/close, focus return, links, scrolling, RTL layout, and the Cash permission gate when available in the preview session.
- Confirm no backend, migration, generated type, navigation, roadmap, deployment, or publishing changes.
- Report changed files, exact command results and limitations, and the resulting repository commit state/SHA without rewriting Git history.
