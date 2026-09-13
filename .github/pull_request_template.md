## Summary

Describe what changed and why.

## Verification

- [ ] `bun install --frozen-lockfile`
- [ ] `bun run typecheck`
- [ ] `bun run build`
- [ ] `bun run lint` reviewed; any existing baseline issues are not worsened by this PR

## Risk check

- [ ] No private credentials, service-role keys, passwords, PINs, guest bearer tokens, or payment secrets were added.
- [ ] Database changes are additive/backward-compatible, or the migration risk is explicitly explained below.
- [ ] Payments, checkout, permissions/auth, cash reconciliation, and inventory-consumption idempotency are unchanged, or focused verification/tests are included.
- [ ] The change is scoped and does not include unrelated refactors.

## Notes / migration risk

Add anything a reviewer should know before merging.
