# Screenshots

The six desktop JPGs in this directory are the ones rendered in the
[README](../../README.md) screenshot table.

| File                     | Screen           | What it shows                                                                 |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------- |
| `caiat-room-board.jpg`   | `/home`          | All 7 rooms with status, above today's arrivals and departures                |
| `caiat-stay-detail.jpg`  | `/stays/<id>`    | A stay's itemised bill with total, paid and outstanding balance               |
| `caiat-dashboard.jpg`    | `/dashboard`     | Owner KPI cards — occupancy, revenue, payments, cash expected in safe         |
| `caiat-cash-control.jpg` | `/cash`          | Cash grouped by employee, expected in safe, counted cash and the difference   |
| `caiat-guest-portal.jpg` | `/guest/<token>` | The guest-facing service catalogue                                            |
| `caiat-stock.jpg`        | `/stock`         | Ingredient stock levels, buy suggestions and the receive/adjust/waste actions |

## Replacing or adding a screenshot

Keep the filenames above — the README references them directly. If you add a new one, add
a row to the README table in the same style.

These files are in a **public repository**, so check each image before committing it:

- **No real guest data.** Names, phone numbers, nationalities, booking references and bill
  amounts must all be fictional test data.
- **No credentials.** No PINs, no passwords, no Supabase keys, no PayPal identifiers.
- **No guest access tokens.** The guest portal URL contains a live per-stay token. If the
  browser address bar is visible in a `/guest/<token>` screenshot, crop it out or revoke the
  token afterwards from the stay.
- **Staff/admin display names** are fine to leave visible.

The current set was checked against all four points before being committed.

## Optional but worth it

A short screen recording of one complete flow — create a stay → add a charge → take a
payment → check out — converted to an animated GIF and placed at the top of the README is
the single most effective thing still missing. Keep it under about 10 seconds and under 5 MB
so it loads on GitHub.
