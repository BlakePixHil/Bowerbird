# Bowerbird

All your money in one place. A private web app that brings a household's bank accounts together, shows where the money goes, and helps with budgets that follow your payday. It only ever reads your data and never moves money.

## Run it locally

You need Node 22, pnpm (`corepack enable`) and a local Postgres 16.

```sh
pnpm install
cp .env.example .env.local   # fill in the values you need
pnpm db:migrate              # create the tables
pnpm db:seed:demo            # optional: a made-up household with three months of data
pnpm dev                     # http://localhost:3000
pnpm check                   # typecheck, lint, format and unit tests
```

After changing `src/lib/db/schema.ts`, run `pnpm db:generate` to write a new migration into `drizzle/`. The demo seed only runs against a database on your own computer.

## Design system

Colours live in `src/styles/tokens.css` and nowhere else. Shared components are in `src/components/ui` and charts in `src/components/charts`, each with its own CSS Module. Open [localhost:3000/dev/ui](http://localhost:3000/dev/ui) and [localhost:3000/dev/charts](http://localhost:3000/dev/charts) to see them in both themes. Those pages also work on Vercel previews and never on the live app.

## App shell

Signed-in pages live in `src/app/(app)` and sit inside the frame from `src/components/shell`: a sidebar on desktop and a floating tab bar on a phone (760px and narrower). Each page starts with `<PageHeader>`. The menus come from `src/components/shell/nav.ts`, and features from later phases stay hidden until they are switched on in `src/config/features.ts`. A test fails if a menu item points at a page that doesn't exist.

## Source of truth

The plan, architecture, design rules and decisions live in Linear. Read [00 · Start here](https://linear.app/budgetteam/document/00-start-here-read-first-a2617b8c803a) before picking up any work. Where this repo and those documents disagree, the documents win.
