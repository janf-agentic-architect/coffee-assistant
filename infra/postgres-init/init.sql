-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop old chat_messages table if present
DROP TABLE IF EXISTS "chat_messages";

-- Tables
CREATE TABLE IF NOT EXISTS "coffee_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_name" text NOT NULL,
	"coffee_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"favorite_drink" text,
	"loyalty_points" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
('Croissant de Almendras', 'Panadería', 3.80, 'Hojaldre artesanal relleno de crema de almendras tostadas', false);

INSERT INTO "customers" ("name", "email", "phone", "favorite_drink", "loyalty_points") VALUES
('Carlos Mendoza', 'carlos.mendoza@email.com', '+52 55 1234 5678', 'Espresso Doble', 120),
('Sofía Gómez', 'sofia.gomez@email.com', '+52 55 8765 4321', 'Flat White', 245),
('Alejandro Pérez', 'alejandro.perez@email.com', '+52 55 3456 7890', 'Cappuccino Vainilla', 80),
('Valeria Ramos', 'valeria.ramos@email.com', '+52 55 9012 3456', 'Cold Brew', 310),
('Martín Silva', 'martin.silva@email.com', '+52 55 6543 2109', 'Latte Caramelo', 45);

INSERT INTO "coffee_orders" ("customer_name", "coffee_type", "quantity", "status", "notes") VALUES
('Carlos Mendoza', 'Espresso Doble', 1, 'completed', 'Sin azúcar'),
('Sofía Gómez', 'Flat White', 2, 'pending', 'Leche de avena'),
('Alejandro Pérez', 'Cappuccino Vainilla', 1, 'pending', 'Canela extra'),
('Valeria Ramos', 'Cold Brew', 1, 'completed', 'Hielo extra'),
('Martín Silva', 'Latte Caramelo', 1, 'cancelled', 'Cliente canceló el pedido');
