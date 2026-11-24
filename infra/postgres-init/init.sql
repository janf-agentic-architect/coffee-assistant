-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop old tables if present
DROP TABLE IF EXISTS "chat_messages";
DROP TABLE IF EXISTS "order_items";
DROP TABLE IF EXISTS "coffee_orders";
DROP TABLE IF EXISTS "customers";
DROP TABLE IF EXISTS "products";
DROP TABLE IF EXISTS "businesses";

-- Tables
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

CREATE UNIQUE INDEX IF NOT EXISTS "businesses_whatsapp_phone_number_id_unique"
	ON "businesses" ("whatsapp_phone_number_id")
	WHERE "whatsapp_phone_number_id" IS NOT NULL AND "whatsapp_phone_number_id" <> '';

CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid REFERENCES "businesses"("id") ON DELETE CASCADE,
	"user_id" text,
	"name" text NOT NULL,
	"category" text DEFAULT 'Hot Coffee' NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"description" text,
	"available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid REFERENCES "businesses"("id") ON DELETE CASCADE,
	"user_id" text,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"favorite_drink" text,
	"loyalty_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "customers_business_phone_unique"
	ON "customers" ("business_id", regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g'))
	WHERE "business_id" IS NOT NULL
		AND "phone" IS NOT NULL
		AND regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g') <> '';

CREATE TABLE IF NOT EXISTS "coffee_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid REFERENCES "businesses"("id") ON DELETE CASCADE,
	"user_id" text,
	"customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
	"customer_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT 0.00 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL REFERENCES "coffee_orders"("id") ON DELETE CASCADE,
	"product_id" uuid REFERENCES "products"("id") ON DELETE SET NULL,
	"product_name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) DEFAULT 0.00 NOT NULL,
	"notes" text
);

-- Seed Initial Data
INSERT INTO "businesses" ("id", "owner_user_id", "name") VALUES
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'The Cloud Cafe');

INSERT INTO "products" ("business_id", "user_id", "name", "category", "price", "description", "available") VALUES
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Espresso', 'Hot Coffee', 3.00, 'Rich freshly ground 100% Arabica espresso shot', true),
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Double Espresso', 'Hot Coffee', 3.75, 'Double shot of espresso with thick crema', true),
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Flat White', 'Hot Coffee', 4.50, 'Double ristretto with silky steamed microfoam', true),
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Vanilla Cappuccino', 'Specialties', 4.75, 'Espresso, steamed milk, creamy foam, and a hint of vanilla', true),
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Caramel Latte', 'Specialties', 5.00, 'Smooth espresso with creamy milk and house-made caramel syrup', true),
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Cold Brew', 'Cold Coffee', 4.50, '18-hour cold-steeped coffee, smooth and refreshing', true),
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Matcha Latte', 'Coffee-Free', 5.25, 'Ceremonial Japanese green matcha tea with your choice of milk', true),
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Almond Croissant', 'Bakery', 3.80, 'Artisanal flaky pastry filled with toasted almond cream', true);

INSERT INTO "customers" ("business_id", "user_id", "name", "email", "phone", "favorite_drink", "loyalty_points") VALUES
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Carlos Mendoza', 'carlos.mendoza@email.com', '+1 555 123 4567', 'Double Espresso', 120),
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Sofia Gomez', 'sofia.gomez@email.com', '+1 555 876 5432', 'Flat White', 245),
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Alex Perez', 'alex.perez@email.com', '+1 555 345 6789', 'Vanilla Cappuccino', 80),
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Valeria Ramos', 'valeria.ramos@email.com', '+1 555 901 2345', 'Cold Brew', 310),
('00000000-0000-0000-0000-000000000001', 'usr_demo_business', 'Martin Silva', 'martin.silva@email.com', '+1 555 654 3210', 'Caramel Latte', 45);

-- Seed Orders & Multi-Product Order Items
WITH o1 AS (
  INSERT INTO "coffee_orders" ("customer_id", "customer_name", "status", "total_amount", "notes")
  SELECT id, 'Carlos Mendoza', 'completed', 7.55, 'For here at the bar' FROM "customers" WHERE name = 'Carlos Mendoza' LIMIT 1
  RETURNING id
)
INSERT INTO "order_items" ("order_id", "product_id", "product_name", "quantity", "unit_price", "notes")
SELECT o1.id, p.id, p.name, 1, p.price, 'No sugar' FROM o1, "products" p WHERE p.name = 'Double Espresso'
UNION ALL
SELECT o1.id, p.id, p.name, 1, p.price, NULL FROM o1, "products" p WHERE p.name = 'Almond Croissant';

WITH o2 AS (
  INSERT INTO "coffee_orders" ("customer_id", "customer_name", "status", "total_amount", "notes")
  SELECT id, 'Sofia Gomez', 'pending', 14.25, 'To go' FROM "customers" WHERE name = 'Sofia Gomez' LIMIT 1
  RETURNING id
)
INSERT INTO "order_items" ("order_id", "product_id", "product_name", "quantity", "unit_price", "notes")
SELECT o2.id, p.id, p.name, 2, p.price, 'Oat milk' FROM o2, "products" p WHERE p.name = 'Flat White'
UNION ALL
SELECT o2.id, p.id, p.name, 1, p.price, 'Almond milk' FROM o2, "products" p WHERE p.name = 'Matcha Latte';

WITH o3 AS (
  INSERT INTO "coffee_orders" ("customer_id", "customer_name", "status", "total_amount", "notes")
  SELECT id, 'Alex Perez', 'pending', 4.75, 'Extra cinnamon' FROM "customers" WHERE name = 'Alex Perez' LIMIT 1
  RETURNING id
)
INSERT INTO "order_items" ("order_id", "product_id", "product_name", "quantity", "unit_price", "notes")
SELECT o3.id, p.id, p.name, 1, p.price, NULL FROM o3, "products" p WHERE p.name = 'Vanilla Cappuccino';

WITH o4 AS (
  INSERT INTO "coffee_orders" ("customer_id", "customer_name", "status", "total_amount", "notes")
  SELECT id, 'Valeria Ramos', 'completed', 16.60, 'Extra ice' FROM "customers" WHERE name = 'Valeria Ramos' LIMIT 1
  RETURNING id
)
INSERT INTO "order_items" ("order_id", "product_id", "product_name", "quantity", "unit_price", "notes")
SELECT o4.id, p.id, p.name, 2, p.price, NULL FROM o4, "products" p WHERE p.name = 'Cold Brew'
UNION ALL
SELECT o4.id, p.id, p.name, 2, p.price, NULL FROM o4, "products" p WHERE p.name = 'Almond Croissant';
