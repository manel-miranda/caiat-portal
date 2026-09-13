# Tests

`bun test` runs the suites in this directory.

## Inventory-consumption idempotency

`inventory-consumption.test.ts` covers the food order → inventory deduction
flow. The guarantee it checks lives entirely in the database, so the tests run
the real files in `supabase/migrations` against a throwaway PostgreSQL
database and call the real RPCs (`preview_food_order_set_status`,
`inventory_consume_preview_order`). Nothing is mocked and no hosted Supabase
project is contacted.

### Running them

You need a PostgreSQL server the tests can create and drop databases on. Point
`INVENTORY_TEST_DATABASE_URL` at an admin connection string:

```sh
INVENTORY_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres" bun test
```

With Docker:

```sh
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name caiat-pg postgres:16
INVENTORY_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres" bun test
docker rm -f caiat-pg
```

Each test file creates its own database named `caiat_idem_*`, applies the
prelude plus every migration, and drops the database again at the end.

Without `INVENTORY_TEST_DATABASE_URL` (or `DATABASE_URL`) the suites are
**skipped**, so `bun test` still works on a machine with no PostgreSQL. CI sets
`INVENTORY_TESTS_REQUIRED=1`, which turns a missing database URL into a
failure instead of a silent skip.

### `support/supabase-prelude.sql`

The migrations assume a Supabase database (the `auth` schema, the
`anon`/`authenticated`/`service_role` roles, the `extensions` schema, the
`supabase_realtime` publication). The prelude creates the minimum stand-ins so
the migrations apply unchanged on plain PostgreSQL. It is test scaffolding
only — nothing in it is asserted on, and `auth.uid()` is a simple session
setting so a test can act as a given staff member.
