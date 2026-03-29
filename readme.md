# MSP

MSP is a monorepo for MSP tooling — an indexing server, a React dashboard app, and a CLI — built on [Filecoin](https://filecoin.io/) smart contracts via `@filoz/synapse-core`.

## Prerequisites

### Install Bun

MSP requires [Bun](https://bun.sh) `>=1.3.10` as its runtime and package manager. Follow the [official installation guide](https://bun.com/docs/installation) to install it.

### Install dependencies

From the repo root:

```bash
bun install
```

## Repo structure

```
msp/
├── apps/
│   ├── server/   # msp-server — Hono API + Foxer indexer + Drizzle ORM (Postgres)
│   ├── app/      # msp-app    — Vite + React dashboard (Tailwind, wagmi, shadcn)
│   └── cli/      # msp-cli    — CLI built with incur (wallet, session-keys, datasets, pieces, pay)
├── packages/     # shared packages (workspace)
├── biome.json    # linter/formatter config
├── AGENTS.md     # agent guidelines
└── package.json  # workspace root (bun workspaces)
```

## MSP Server

The server (`apps/server`) is a [Foxer](https://www.npmjs.com/package/@hugomrdias/foxer)-powered blockchain indexer with a Hono API layer. It indexes Filecoin calibration-net contract events (session keys, datasets, pieces, providers) into Postgres via Drizzle ORM.

### Setup `.env.local`

Create `apps/server/.env.local` using the example as a reference:

```bash
cp apps/server/.env.example apps/server/.env.local
```

Then fill in the values:

```env
# DATABASE_URL=postgres://postgres:postgres@localhost:5432/msp
RPC_URL=https://your-archive-rpc/archive/evm/314159
RPC_LIVE_URL=https://your-live-rpc/live/evm/314159
LOG_LEVEL=info
PORT=4200
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | *Optional.* Postgres connection string. When omitted, Foxer uses an embedded [PGlite](https://pglite.dev/) database so you don't need a running Postgres instance. Set this only if you want to use an external Postgres server. |
| `RPC_URL` | Archive EVM RPC endpoint for Filecoin calibration net |
| `RPC_LIVE_URL` | Live/realtime EVM RPC endpoint for Filecoin calibration net |
| `LOG_LEVEL` | Log verbosity (`info`, `debug`, `warn`, `error`) |
| `PORT` | Port the server listens on (default `4200`) |

### Generate database schema

```bash
cd apps/server
bun run generate
```

### Start the server

From the repo root:

```bash
bun run server
```

Or directly:

```bash
cd apps/server
bun run dev
```

The API will be available at `http://localhost:4200`.

## App (React Dashboard)

The app (`apps/app`) is a Vite + React frontend that connects to the MSP server and lets you browse datasets, pieces, session keys, and providers through a wallet-connected UI.

The app expects the server to be running on `http://localhost:4200`.

### Start the app

From the repo root:

```bash
bun run app
```

Or directly:

```bash
cd apps/app
bun run dev
```

## CLI

The CLI (`apps/cli`) is built with [incur](https://www.npmjs.com/package/incur) and provides commands for interacting with MSP contracts from the terminal.

### Usage

From the repo root:

```bash
bun run cli <command> [options]
```

### Available commands

| Command | Description |
|---|---|
| `wallet` | Wallet management |
| `session-keys` | Manage session key authorizations |
| `datasets` | Manage datasets |
| `pieces` | Manage pieces |
| `pay` | Payment operations |

### Global options

| Option | Description |
|---|---|
| `--chainId <number>` | Chain ID to use |
| `--debug` | Enable debug mode |

### Examples

```bash
# Show help
bun run cli --help

# List session keys
bun run cli session-keys

# Manage datasets with debug output
bun run cli datasets --debug
```

## Lint and format

```bash
# Check the whole repo
bun run check
```

Individual apps also have their own check scripts (`tsc --noEmit && biome check .`):

```bash
cd apps/server && bun run check
cd apps/app && bun run check
cd apps/cli && bun run check
```
