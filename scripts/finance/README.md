# Fictional finance history

For the owner's evaluation only. These are illustrative MAD prices, not market
quotes or accounting records. Installing the `finance_sample_history` migration
only installs a private helper; it does not seed the main app automatically.

After explicit approval, the database owner should run `scripts/finance/seed.sql`.
It wraps the following call with assertions that preserve existing business
records, and checks that repeating the call adds no duplicates:

```sql
SELECT finance_sample_private.seed_history();
```

The helper adds six purchase dates across the last 30 days for known sample
ingredients whose latest purchase cost is missing. Existing usable prices,
selling prices, recipes, purchases and stock movements are left unchanged.
Unknown ingredient keys and future-dated latest purchases are skipped.
Suppliers are marked `[FICTIONAL]`; purchase notes start with
`[FICTIONAL FINANCE V1]`. Repeating the call does not duplicate history.

These are historical cost-only records, assumed consumed before opening stock:
they intentionally create no receipts, stock changes, payments or guest charges.
Purchase spending summaries will include them. They are not evidence of real
expenses. The finance page uses their latest prices to calculate ingredient-only
gross margins; dishes with no recipe still correctly show unknown costs.

The public demo recreates the history during its existing hourly reset. The
migration upgrades an installed demo's reset function without executing a reset.
Fresh demo installations use the same helper. Main-app history is not scheduled.

Before real operations begin, remove only purchases bearing the exact marker
above (their lines cascade), and then remove unused fictional suppliers bearing
the exact note `Fictional finance sample V1; not a real trading partner.`. Review
the matching rows first. Disable the seed call in the demo reset if the demo is
also being converted to real use. No inventory adjustment is needed for removal.
