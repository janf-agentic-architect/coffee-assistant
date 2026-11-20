import { pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core'

export const coffeeOrders = pgTable('coffee_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerName: text('customer_name').notNull(),
  coffeeType: text('coffee_type').notNull(),
  quantity: integer('quantity').notNull().default(1),
  status: text('status').notNull().default('pending'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: text('session_id').notNull(),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type CoffeeOrder = typeof coffeeOrders.$inferSelect
export type NewCoffeeOrder = typeof coffeeOrders.$inferInsert
export type ChatMessage = typeof chatMessages.$inferSelect
export type NewChatMessage = typeof chatMessages.$inferInsert
