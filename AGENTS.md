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
- All contributors, including Lovable, must submit changes through a branch and pull request. No actor may bypass the required checks on `main`; configure Lovable's workflow accordingly before syncing changes.
- Codex, Claude Code, and manual engineering work should start from the latest `main` on a dedicated branch such as `feature/...`, `fix/...`, `refactor/...`, or `chore/...`.
- Open a pull request back to `main`; do not force-push or rewrite published history.
- Before a pull request is considered ready, run `bun install --frozen-lockfile` and `bun run check`.
- Run `bun run format:check` and `bun run lint` too. Both are blocking CI steps; fix errors and review warnings before a PR is ready. Avoid introducing new warnings.
- Follow `.editorconfig`, `.gitattributes`, and `.prettierrc`: UTF-8, LF line endings, two-space indentation, double quotes, semicolons, and Prettier-managed wrapping. Run `bun run format` after edits.
- Generated route files and Lovable-managed preview auth storage are excluded from formatting/linting; update their generators instead of hand-formatting them.
- Keep database migrations additive and backward-compatible unless an explicitly reviewed migration requires otherwise.
- Never commit private credentials, service-role keys, passwords, PINs, guest bearer tokens, or payment secrets.
- Changes touching payments, checkout, permissions/auth, cash reconciliation, or inventory-consumption idempotency are high risk: preserve existing behavior and add focused verification/tests when modifying them.
- Avoid unrelated refactors in the same pull request. Keep changes small enough to review and revert safely.
