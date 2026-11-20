import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

const { Pool } = pg

let pool: pg.Pool | null = null

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

export type Database = ReturnType<typeof getDb>
export * from './schema'
