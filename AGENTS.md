# msp — Agent guidelines

Orientation for this repository's layout and tooling. Apps that use the **incur** CLI framework depend on the `[incur](https://www.npmjs.com/package/incur)` package; see that package's documentation for incur-specific patterns when working on those CLIs.

## Monorepo

- **Workspaces** — `[package.json](package.json)` defines `packages/*` and `apps/*`.
- **Runtime / package manager** — [Bun](https://bun.com) `>=1.3.10`; lockfile and installs use **`bun@1.3.10`** (`packageManager` in root `package.json`).
- **Shared root deps** — TypeScript, Biome, `@hugomrdias/configs`.

## Lint and format

- Root `[biome.json](biome.json)` extends `@hugomrdias/configs/biome`.
- Some apps add or override config locally (e.g. `[apps/server/biome.json](apps/server/biome.json)`).

## Applications

| Path | Package | Role / stack | Notable scripts |
| --- | --- | --- | --- |
| `[apps/server](apps/server)` | `msp-server` | Hono API, Foxer indexer (`foxer dev`), Drizzle ORM + `drizzle-kit`, Zod, viem, `@filoz/synapse-core`, `@hono/standard-validator` | `dev`, `generate`, `check`, `build` |
| `[apps/app](apps/app)` | `msp-app` | Vite + React dashboard; Tailwind, wagmi, shadcn, `@hugomrdias/foxer-client`, `@hugomrdias/foxer-react`, `@tanstack/react-query`, nanostores | `dev`, `check`, `build`, `preview` |
| `[apps/cli](apps/cli)` | `msp-cli` | CLI: **incur**, viem, `@filoz/synapse-core`, `@clack/prompts`, `conf`, `@hugomrdias/foxer-client` | `check` |

## Common commands

- **Install** (repo root): `bun install`
- **Checks** (from each app directory): `bun run check` where defined (`tsc` + `biome` in most cases).
- **Server dev**: `bun run server` (from root) or `cd apps/server && bun run dev`
- **App dev**: `bun run app` (from root) or `cd apps/app && bun run dev`
- **CLI**: `bun run cli <command> [options]` (from root)
- **Build server client types**: `bun run build` (from root, runs `tsc` for `msp-server`)

## Design

Design specification can be found in `./design/spec.md`.
