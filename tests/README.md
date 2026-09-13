# Tests

`bun test` runs the suites in this directory.

`bun run typecheck:tests` typechecks the test sources and support harness without running them. CI runs this separately from the application typecheck, so test-code TypeScript errors block a pull request just like application TypeScript errors do.

The test TypeScript configuration lives in `tsconfig.tests.json`. `tests/types/bun.d.ts` contains only the small Bun API surface used by this repository's test harness, so no runtime dependency is added just to typecheck the tests.

## Database regression suites

The PostgreSQL-backed suites currently cover:

- food order → inventory deduction idempotency;
- inventory permission boundaries;
- catalogue production hardening;
- broader staff/admin permission and row-level-security boundaries.

The guarantees live in the database, so these tests run the real files in `supabase/migrations` against throwaway PostgreSQL databases and call the real RPCs. Nothing is mocked and no hosted Supabase project is contacted.

### Running them

You need a PostgreSQL server the tests can create and drop databases on. Point `INVENTORY_TEST_DATABASE_URL` at an admin connection string:

```sh
INVENTORY_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres" bun test
```

With Docker:

```sh
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres --name caiat-pg postgres:16
INVENTORY_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres" bun test
docker rm -f caiat-pg
```

Each test file creates its own database named `caiat_idem_*`, applies the prelude plus every migration, and drops the database again at the end.

Without `INVENTORY_TEST_DATABASE_URL` (or `DATABASE_URL`) the database suites are **skipped**, so `bun test` still works on a machine with no PostgreSQL. CI sets `INVENTORY_TESTS_REQUIRED=1`, which turns a missing database URL into a failure instead of a silent skip.

### `support/supabase-prelude.sql`

The migrations assume a Supabase database (the `auth` schema, the `anon`/`authenticated`/`service_role` roles, the `extensions` schema and the `supabase_realtime` publication). The prelude creates the minimum stand-ins so the migrations apply unchanged on plain PostgreSQL. It is test scaffolding only — nothing in it is asserted on, and `auth.uid()` is a simple session setting so a test can act as a given staff member.
