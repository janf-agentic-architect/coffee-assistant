-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tables
CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

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

-- Seed Initial Data
INSERT INTO "coffee_orders" ("customer_name", "coffee_type", "quantity", "status", "notes") VALUES
('Carlos Mendoza', 'Espresso Doble', 1, 'completed', 'Sin azúcar'),
('Sofía Gómez', 'Flat White', 2, 'pending', 'Leche de avena'),
('Alejandro Pérez', 'Cappuccino Vainilla', 1, 'pending', 'Canela extra'),
('Valeria Ramos', 'Cold Brew', 1, 'completed', 'Hielo extra'),
('Martín Silva', 'Latte Caramelo', 1, 'cancelled', 'Cliente canceló el pedido');

INSERT INTO "chat_messages" ("session_id", "role", "content") VALUES
('demo-session-1', 'user', '¡Hola! ¿Qué tipos de café tienen disponibles?'),
('demo-session-1', 'assistant', '¡Hola! Tenemos Espresso, Flat White, Cappuccino, Latte, Cold Brew y más. ¿Te gustaría ordenar alguno?');
