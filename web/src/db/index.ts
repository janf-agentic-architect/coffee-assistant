import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import pg from 'pg'
import * as schema from './schema'

const { Pool } = pg

let pool: pg.Pool | null = null
let schemaMigrated = false

export function getDb(connectionString?: string) {
  const url = connectionString || (typeof process !== 'undefined' ? process.env.DATABASE_URL : undefined)
  if (!url) {
    throw new Error('DATABASE_URL is not set')
  }

  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 10,
      maxUses: 1, // Close connection after use to prevent stale sockets in Workers/serverless runtime
    })
  }

  return drizzle(pool, { schema })
}

export async function ensureMultiTenantSchema(db: ReturnType<typeof getDb>) {
  if (schemaMigrated) return
  try {
    await db.execute(sql`
      ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "user_id" text;
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "user_id" text;
      ALTER TABLE "coffee_orders" ADD COLUMN IF NOT EXISTS "user_id" text;
    `)
    schemaMigrated = true
  } catch {
    // Ignore if table doesn't exist yet or connection lacks DDL permission
  }
}

export type Database = ReturnType<typeof getDb>
export * from './schema'
