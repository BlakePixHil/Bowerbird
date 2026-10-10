# Bowerbird

All your money in one place. A private web app that brings a household's bank accounts together, shows where the money goes, and helps with budgets that follow your payday. It only ever reads your data and never moves money.

## Run it locally

You need Node 22 and pnpm (`corepack enable`).

```sh
pnpm install
cp .env.example .env.local   # fill in the values you need
pnpm dev                     # http://localhost:3000
pnpm check                   # typecheck, lint, format and unit tests
```

## Source of truth

The plan, architecture, design rules and decisions live in Linear. Read [00 · Start here](https://linear.app/budgetteam/document/00-start-here-read-first-a2617b8c803a) before picking up any work. Where this repo and those documents disagree, the documents win.
