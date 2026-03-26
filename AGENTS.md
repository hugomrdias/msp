# myelin — Agent guidelines

Orientation for this repository’s layout and tooling. Apps that use the **incur** CLI framework depend on the `[incur](https://www.npmjs.com/package/incur)` package; see that package’s documentation for incur-specific patterns when working on those CLIs.

## Monorepo

- **Workspaces** — `[package.json](package.json)` defines `packages/*` and `apps/*`.
- **Runtime / package manager** — [Bun](https://bun.com) `>=1.3.10`; lockfile and installs use `**bun@1.3.10`** (`packageManager` in root `package.json`).
- **Shared root deps** — TypeScript, Biome, `@hugomrdias/configs`.

## Lint and format

- Root `[biome.json](biome.json)` extends `@hugomrdias/configs/biome`.
- Some apps add or override config locally (e.g. `[apps/server/biome.json](apps/server/biome.json)`).

## Applications


| Path                               | Package         | Role / stack                                                                                                             | Notable scripts                                                   |
| ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `[apps/server](apps/server)`       | `myelin-server` | Hono API, Foxer (`foxer dev`), Drizzle ORM + `drizzle-kit`, Zod, viem, `@filoz/synapse-core`, `@hono/standard-validator` | `dev`, `generate`, `check`, `build`                               |
| `[apps/cli](apps/cli)`             | `myelin-cli`    | CLI: **incur**, viem, `@filoz/synapse-core`, `@clack/prompts`, `conf`                                                    | `check`                                                           |
| `[apps/vite-hono](apps/vite-hono)` | `vite-hono`     | Vite + React frontend; Hono API served with Bun (`server/index.ts`). `dev` runs web + API via **concurrently**           | `dev`, `dev:web`, `dev:api`, `build`, `check`, `start`, `preview` |


## Common commands

- **Install** (repo root): `bun install`
- **Checks** (from each app directory): `bun run check` where defined (`tsc` + `biome` in most cases).
- **Server dev**: `cd apps/server && bun run dev`
- **Vite + API dev**: `cd apps/vite-hono && bun run dev`

## Design

Design specification can be found `./design/spec.md`.
