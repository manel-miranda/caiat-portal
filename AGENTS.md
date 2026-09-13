<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Engineering workflow

- Treat `main` as the production/current branch.
- Lovable may continue syncing approved product changes to its connected branch.
- Codex, Claude Code, and manual engineering work should start from the latest `main` on a dedicated branch such as `feature/...`, `fix/...`, `refactor/...`, or `chore/...`.
- Open a pull request back to `main`; do not force-push or rewrite published history.
- Before a pull request is considered ready, run `bun install --frozen-lockfile` and `bun run check`.
- Keep database migrations additive and backward-compatible unless an explicitly reviewed migration requires otherwise.
- Never commit private credentials, service-role keys, passwords, PINs, guest bearer tokens, or payment secrets.
- Changes touching payments, checkout, permissions/auth, cash reconciliation, or inventory-consumption idempotency are high risk: preserve existing behavior and add focused verification/tests when modifying them.
- Avoid unrelated refactors in the same pull request. Keep changes small enough to review and revert safely.
