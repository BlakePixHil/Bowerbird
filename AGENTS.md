# Working on Bowerbird

- The source of truth is in Linear, team BudgetTeam (key BUD). Read [00 · Start here](https://linear.app/budgetteam/document/00-start-here-read-first-a2617b8c803a) and the documents it lists before you start a ticket.
- One ticket per pull request, on the branch Linear suggests, with the ticket id in the PR title.
- `pnpm check` must pass before you push.
- The app's name only ever comes from `APP_NAME` and `APP_SHORT_NAME` in `src/config/app.ts`.
- Money is integer cents. Never use floats for money.
- Never commit secrets, real bank files or real transactions.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
