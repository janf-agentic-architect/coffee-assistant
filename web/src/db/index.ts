import { drizzle } from 'drizzle-orm/node-postgres'
import { and, asc, eq, sql } from 'drizzle-orm'
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
      CREATE TABLE IF NOT EXISTS "businesses" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "owner_user_id" text NOT NULL,
        "name" text DEFAULT 'My Coffee Shop' NOT NULL,
        "description" text,
        "assistant_instructions" text,
        "whatsapp_phone_number_id" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "description" text;
      ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "assistant_instructions" text;
      CREATE UNIQUE INDEX IF NOT EXISTS "businesses_whatsapp_phone_number_id_unique"
        ON "businesses" ("whatsapp_phone_number_id")
        WHERE "whatsapp_phone_number_id" IS NOT NULL AND "whatsapp_phone_number_id" <> '';
      ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "user_id" text;
      ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "business_id" uuid REFERENCES "businesses"("id") ON DELETE cascade;
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "user_id" text;
      ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "business_id" uuid REFERENCES "businesses"("id") ON DELETE cascade;
      CREATE UNIQUE INDEX IF NOT EXISTS "customers_business_phone_unique"
        ON "customers" ("business_id", regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g'))
        WHERE "business_id" IS NOT NULL
          AND "phone" IS NOT NULL
          AND regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') <> '';
      ALTER TABLE "coffee_orders" ADD COLUMN IF NOT EXISTS "user_id" text;
      ALTER TABLE "coffee_orders" ADD COLUMN IF NOT EXISTS "business_id" uuid REFERENCES "businesses"("id") ON DELETE cascade;
    `)
    schemaMigrated = true
  } catch {
    // Ignore if table doesn't exist yet or connection lacks DDL permission
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getOrCreateBusinessForUser(
  db: ReturnType<typeof getDb>,
  user: { uid: string; displayName?: string }
): Promise<schema.Business> {
  await ensureMultiTenantSchema(db)

  const [existing] = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.ownerUserId, user.uid))
    .orderBy(asc(schema.businesses.createdAt))

  if (existing) {
    return existing
  }

  const [created] = await db
    .insert(schema.businesses)
    .values({
      ownerUserId: user.uid,
      name: user.displayName ? `${user.displayName}'s Coffee Shop` : 'My Coffee Shop',
    })
    .returning()

  // Backfill any legacy rows owned by user.uid that don't have business_id yet
  await db.execute(sql`
    UPDATE "products" SET "business_id" = ${created.id} WHERE "user_id" = ${user.uid} AND "business_id" IS NULL;
    UPDATE "customers" SET "business_id" = ${created.id} WHERE "user_id" = ${user.uid} AND "business_id" IS NULL;
    UPDATE "coffee_orders" SET "business_id" = ${created.id} WHERE "user_id" = ${user.uid} AND "business_id" IS NULL;
  `)

  return created
}

export async function listBusinessesForUser(
  db: ReturnType<typeof getDb>,
  user: { uid: string; displayName?: string }
): Promise<schema.Business[]> {
  await ensureMultiTenantSchema(db)

  const list = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.ownerUserId, user.uid))
    .orderBy(asc(schema.businesses.createdAt))

  if (list.length > 0) {
    return list
  }

  const created = await getOrCreateBusinessForUser(db, user)
  return [created]
}

export async function resolveActiveBusinessForUser(
  db: ReturnType<typeof getDb>,
  user: { uid: string; displayName?: string },
  requestedBusinessId?: string | null
): Promise<schema.Business> {
  await ensureMultiTenantSchema(db)

  const candidate = requestedBusinessId?.trim()
  if (candidate && UUID_REGEX.test(candidate)) {
    const [matched] = await db
      .select()
      .from(schema.businesses)
      .where(
        and(
          eq(schema.businesses.id, candidate),
          eq(schema.businesses.ownerUserId, user.uid)
        )
      )
    if (matched) {
      return matched
    }
  }

  return getOrCreateBusinessForUser(db, user)
}

export type Database = ReturnType<typeof getDb>
export * from './schema'
