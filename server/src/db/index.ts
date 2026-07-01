import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import dotenv from 'dotenv';

dotenv.config();

const client = postgres(process.env.DATABASE_URL!, {
    // Neon pooled URLs use PgBouncer transaction mode — prepared statements break
    prepare: false,
});

export const db = drizzle(client, { schema });