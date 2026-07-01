# Neon PostgreSQL setup (SyncBeat)

SyncBeat uses Drizzle ORM with a standard Postgres connection string. No Supabase-specific code.

## 1. Create a Neon project

1. Go to [console.neon.tech](https://console.neon.tech) and sign up (free, no credit card).
2. Click **New Project**.
3. **Name:** `syncbeat` (or any name).
4. **Region:** pick one close to you (e.g. `AWS Asia Pacific (Singapore)` or `US East`).
5. Click **Create**.

## 2. Copy the connection string

1. On the project dashboard, open **Connect**.
2. Choose **Connection string**.
3. Select **Pooled connection** (recommended for Render / long-running Node server).
4. Copy the URI. It looks like:

   ```
   postgresql://neondb_owner:xxxxxxxx@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require
   ```

## 3. Update local environment

1. Open `server/.env` (copy from `.env.example` if needed).
2. Set `DATABASE_URL` to the Neon pooled URI you copied.
3. Remove or replace the old Supabase `DATABASE_URL`.

## 4. Create tables in Neon

From the `server/` folder:

```bash
npm install
npm run db:push
```

This applies the schema from `src/db/schema.ts` to your Neon database.

## 5. Verify

```bash
npm run dev
```

You should see `✅ Environment validated` and the server on `http://localhost:3000`.

Optional — browse tables in the browser:

```bash
npm run db:studio
```

## 6. Production (Render)

1. [dashboard.render.com](https://dashboard.render.com) → your **syncbeat-server** service.
2. **Environment** (or `syncbeat-secrets` env group).
3. Update `DATABASE_URL` to the same Neon **pooled** connection string.
4. Save and redeploy.

## Migrating data from Supabase (optional)

Skip this for a fresh side project. If you need existing users/data:

```bash
# Export data from Supabase (use URI from Supabase → Settings → Database)
pg_dump "postgresql://..." --data-only --no-owner -f supabase_data.sql

# Import into Neon
psql "YOUR_NEON_DATABASE_URL" -f supabase_data.sql
```

Requires `pg_dump` and `psql` (install PostgreSQL client tools).

## Free tier notes

- **0.5 GB** storage — enough for metadata; audio files live in R2.
- Scales to zero after **5 minutes** idle — first query after idle may be slow.
- **100 CU-hours/month** — fine for a side project with light traffic.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `prepared statement already exists` | Use Neon **pooled** URL; `db/index.ts` sets `prepare: false` |
| Connection timeout | Wake DB from Neon console; check `sslmode=require` in URL |
| `npm run db:push` fails | Confirm `DATABASE_URL` is set in `server/.env` |
