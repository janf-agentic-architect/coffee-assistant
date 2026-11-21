-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop old tables if present
DROP TABLE IF EXISTS "chat_messages";
DROP TABLE IF EXISTS "order_items";
DROP TABLE IF EXISTS "coffee_orders";
DROP TABLE IF EXISTS "customers";
DROP TABLE IF EXISTS "products";

-- Tables
CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"category" text DEFAULT 'Café Caliente' NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"description" text,
	"available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"favorite_drink" text,
	"loyalty_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "coffee_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
INSERT INTO "products" ("name", "category", "price", "description", "available") VALUES
('Espresso', 'Café Caliente', 3.00, 'Shot intenso de café 100% arábica recién molido', true),
('Espresso Doble', 'Café Caliente', 3.75, 'Doble carga de espresso con crema densa', true),
('Flat White', 'Café Caliente', 4.50, 'Doble ristretto con microespuma sedosa de leche', true),
('Cappuccino Vainilla', 'Especialidades', 4.75, 'Espresso, leche vaporizada, espuma cremosa y toque de vainilla', true),
('Latte Caramelo', 'Especialidades', 5.00, 'Espresso suave con leche cremosa y jarabe artesanal de caramelo', true),
('Cold Brew', 'Café Frío', 4.50, 'Infusión en frío durante 18 horas, suave y refrescante', true),
('Matcha Latte', 'Sin Café', 5.25, 'Té verde matcha ceremonial japonés con leche a elección', true),
('Croissant de Almendras', 'Panadería', 3.80, 'Hojaldre artesanal relleno de crema de almendras tostadas', true);

INSERT INTO "customers" ("name", "email", "phone", "favorite_drink", "loyalty_points") VALUES
('Carlos Mendoza', 'carlos.mendoza@email.com', '+52 55 1234 5678', 'Espresso Doble', 120),
('Sofía Gómez', 'sofia.gomez@email.com', '+52 55 8765 4321', 'Flat White', 245),
('Alejandro Pérez', 'alejandro.perez@email.com', '+52 55 3456 7890', 'Cappuccino Vainilla', 80),
('Valeria Ramos', 'valeria.ramos@email.com', '+52 55 9012 3456', 'Cold Brew', 310),
('Martín Silva', 'martin.silva@email.com', '+52 55 6543 2109', 'Latte Caramelo', 45);

-- Seed Orders & Multi-Product Order Items
WITH o1 AS (
  INSERT INTO "coffee_orders" ("customer_id", "customer_name", "status", "total_amount", "notes")
  SELECT id, 'Carlos Mendoza', 'completed', 7.55, 'Para tomar en barra' FROM "customers" WHERE name = 'Carlos Mendoza' LIMIT 1
  RETURNING id
)
INSERT INTO "order_items" ("order_id", "product_id", "product_name", "quantity", "unit_price", "notes")
SELECT o1.id, p.id, p.name, 1, p.price, 'Sin azúcar' FROM o1, "products" p WHERE p.name = 'Espresso Doble'
UNION ALL
SELECT o1.id, p.id, p.name, 1, p.price, NULL FROM o1, "products" p WHERE p.name = 'Croissant de Almendras';

WITH o2 AS (
  INSERT INTO "coffee_orders" ("customer_id", "customer_name", "status", "total_amount", "notes")
  SELECT id, 'Sofía Gómez', 'pending', 14.25, 'Para llevar' FROM "customers" WHERE name = 'Sofía Gómez' LIMIT 1
  RETURNING id
)
INSERT INTO "order_items" ("order_id", "product_id", "product_name", "quantity", "unit_price", "notes")
SELECT o2.id, p.id, p.name, 2, p.price, 'Leche de avena' FROM o2, "products" p WHERE p.name = 'Flat White'
UNION ALL
SELECT o2.id, p.id, p.name, 1, p.price, 'Leche de almendras' FROM o2, "products" p WHERE p.name = 'Matcha Latte';

WITH o3 AS (
  INSERT INTO "coffee_orders" ("customer_id", "customer_name", "status", "total_amount", "notes")
  SELECT id, 'Alejandro Pérez', 'pending', 4.75, 'Canela extra' FROM "customers" WHERE name = 'Alejandro Pérez' LIMIT 1
  RETURNING id
)
INSERT INTO "order_items" ("order_id", "product_id", "product_name", "quantity", "unit_price", "notes")
SELECT o3.id, p.id, p.name, 1, p.price, NULL FROM o3, "products" p WHERE p.name = 'Cappuccino Vainilla';

WITH o4 AS (
  INSERT INTO "coffee_orders" ("customer_id", "customer_name", "status", "total_amount", "notes")
  SELECT id, 'Valeria Ramos', 'completed', 16.60, 'Hielo extra' FROM "customers" WHERE name = 'Valeria Ramos' LIMIT 1
  RETURNING id
)
INSERT INTO "order_items" ("order_id", "product_id", "product_name", "quantity", "unit_price", "notes")
SELECT o4.id, p.id, p.name, 2, p.price, NULL FROM o4, "products" p WHERE p.name = 'Cold Brew'
UNION ALL
SELECT o4.id, p.id, p.name, 2, p.price, NULL FROM o4, "products" p WHERE p.name = 'Croissant de Almendras';
