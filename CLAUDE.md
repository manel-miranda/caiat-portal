# Claude Code instructions

Before modifying this repository, read and follow `AGENTS.md`.

Key workflow rules:

- Start from the latest `main` on a dedicated feature/fix/refactor/chore branch.
- Do not force-push, rebase, amend, or otherwise rewrite published history because this repository is connected to Lovable.
- Keep changes narrowly scoped and avoid unrelated refactors.
- Run `bun install --frozen-lockfile` and `bun run check` before considering work complete.
- Follow the repository's EditorConfig, Git attributes, Prettier, and ESLint rules. Run `bun run format` after edits and `bun run check:full` before a PR. Formatting and lint errors fail CI.
- All contributors, including Lovable, must use PRs and pass required checks on `main`, with no bypass.
- Keep database migrations additive and backward-compatible unless an explicitly reviewed change requires otherwise.
- Never commit private credentials, service-role keys, passwords, PINs, guest bearer tokens, or payment secrets.
- Treat payments, checkout, permissions/auth, cash reconciliation, and inventory-consumption idempotency as high-risk areas that require focused verification/tests when changed.
- Open a pull request back to `main` and summarize behavior changes, risks, and verification performed.
