# Screenshots

The README has a screenshot table ready to go. It is currently **commented out** so that
GitHub does not render broken images while the image files are missing.

## To activate

1. Save the six desktop **JPG** screenshots in this directory using exactly the filenames in
   the table below.
2. Open [`README.md`](../../README.md), find the `## Screenshots` section, delete the `<!--`
   line above the table and the `-->` line below it.
3. Delete the "_Screenshot files are not committed yet_" line underneath.
4. Commit the images together with that README change.

## Shot list

| Filename           | Screen           | What it shows                                                                   |
| ------------------ | ---------------- | ------------------------------------------------------------------------------- |
| `room-board.jpg`   | `/home`          | All 7 rooms with status, plus today's arrivals, departures and pending requests |
| `stay-detail.jpg`  | `/stays/<id>`    | A stay's itemised bill with total, paid and outstanding balance                 |
| `dashboard.jpg`    | `/dashboard`     | The owner KPI cards                                                             |
| `cash-control.jpg` | `/cash`          | Cash grouped by employee, expected in safe, counted cash and the difference     |
| `guest-portal.jpg` | `/guest/<token>` | The guest-facing service catalogue                                              |
| `stock.jpg`        | `/stock`         | Ingredient stock levels, buy suggestions and the receive/adjust/waste actions   |

## Before committing images

These files go into a **public repository**, so check each one before adding it:

- **No real guest data.** Names, phone numbers, nationalities, booking references and bill
  amounts must all be fictional test data.
- **No credentials.** No PINs, no passwords, no Supabase keys, no PayPal identifiers.
- **No guest access tokens.** The guest portal URL contains a live per-stay token. If the
  browser address bar is visible in a `/guest/<token>` screenshot, crop it out or revoke the
  token afterwards with the "revoke" action on the stay.
- **Staff/admin display names** are fine to leave visible.

## Optional but worth it

A short screen recording of one complete flow — create a stay → add a charge → take a
payment → check out — converted to an animated GIF and placed at the top of the README is
the single most effective thing you can add. Keep it under about 10 seconds and under 5 MB
so it loads on GitHub.
