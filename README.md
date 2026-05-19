# Swamp Sync v2

A revival of Swamp Sync on the matty-stack baseline: Bun, Hono, Better Auth, Drizzle, Postgres, Redis, TanStack Router, TanStack Query, and shadcn/Radix-style UI primitives.

The original project remains available as the legacy reference. This repo is the clean rebuild path.

## Current Status

Baseline initialized from matty-stack. The next pass replaces the example project feature with Swamp Sync scheduling, meetings, invites, and availability matching.

See [REVIVAL.md](./REVIVAL.md) for the migration plan.

## Running Locally

```bash
cp .env.example .env
bun install
docker compose up -d
bun run db:migrate
bun run dev
```

Default URLs:

- Web: `http://localhost:5173`
- Server: `http://localhost:3000`
- WebSocket: `ws://localhost:3000/ws`

## Legacy Remote

```bash
git remote add legacy https://github.com/mattcattb/Swamp-Sync.git
git fetch legacy
```
