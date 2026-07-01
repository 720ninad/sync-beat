# SyncBeat — Agent Guide

Real-time synchronized music listening app (Expo + Express + Socket.io).

## Cursor Rules

Project context lives in `.cursor/rules/`:

| Rule | Scope |
|------|-------|
| `syncbeat-project.mdc` | Always — overview, stack, DB schema |
| `syncbeat-client.mdc` | `client/**/*` |
| `syncbeat-server.mdc` | `server/**/*` |
| `syncbeat-sockets.mdc` | Socket/call/sync files |
| `syncbeat-tracks.mdc` | Track/audio/YouTube files |
| `syncbeat-deployment.mdc` | Render, app.json, env.ts |

## Critical Gotchas

1. **Track casing** — DB uses camelCase (`externalId`), search uses snake_case (`external_id`). Check both on the client.
2. **Socket reconnect** — Re-register call listeners on every reconnect (`setOnReconnect` in `_layout.tsx`).
3. **YouTube stream route** — `GET /api/tracks/stream/:videoId` is public (no auth).
4. **Redis** — Use ioredis with `rediss://` TLS URL, not the `redis` package.
5. **Postgres** — Neon pooled `DATABASE_URL`; see `server/NEON_SETUP.md`.
