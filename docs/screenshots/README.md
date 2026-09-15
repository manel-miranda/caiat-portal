# Screenshots

The README has a screenshot table ready to go — it is currently commented out so that
GitHub does not render broken images. To activate it:

1. Capture the six shots below and save them in this directory using the exact filenames.
2. Open [`README.md`](../../README.md), find the `## Screenshots` section, and delete the
   `<!--` line above the table and the `-->` line below it.
3. Delete the "_Screenshots pending_" line underneath.

## Shot list

| Filename           | Screen           | What it should show                                                                                                                      |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `room-board.png`   | `/home`          | All 7 rooms with a mix of statuses — at least one occupied, one arrival today, one departure today — plus the Today summary strip        |
| `stay-detail.png`  | `/stays/<id>`    | A stay with several charges, at least one pending request, a partial payment, and a visible outstanding balance                          |
| `dashboard.png`    | `/dashboard`     | The owner KPI cards populated with non-zero numbers                                                                                      |
| `cash-control.png` | `/cash`          | A day with cash payments grouped by employee, and a non-zero difference between expected and counted so the discrepancy state is visible |
| `guest-portal.png` | `/guest/<token>` | The guest's bill and the service catalogue                                                                                               |
| `stock.png`        | `/stock`         | Inventory items with varied stock levels, ideally one low-stock item                                                                     |

## How to capture them

**Use a mobile viewport.** This is a mobile-first app and it looks its best at phone width —
a desktop screenshot of a mobile-first layout reads as a stretched, empty page.

In Chrome or Firefox: open DevTools → toggle the device toolbar → choose iPhone 14 Pro
(393 × 852) or similar → use the DevTools menu → "Capture screenshot".

**Populate real-looking data first.** Empty states make the app look unfinished. Seed a few
stays, charges, payments and requests before capturing, and use plausible guest names rather
than "test test".

**Check for real data before publishing.** These images go into a public repository — make
sure no real guest names, phone numbers, booking references or payment details are visible.
Use demo data throughout.

## Optional but worth it

A short screen recording of one complete flow — create a stay → add a charge → take a
payment → check out — converted to an animated GIF and placed at the top of the README is
the single most effective thing you can add. Keep it under about 10 seconds and under 5 MB
so it loads on GitHub.
