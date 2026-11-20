import 'dotenv/config'
import { getDb, coffeeOrders, chatMessages } from './index'

async function seed() {
  console.log('🌱 Seeding database...')
  const db = getDb()

  await db.insert(coffeeOrders).values([
    {
      customerName: 'Carlos Mendoza',
      coffeeType: 'Espresso Doble',
      quantity: 1,
      status: 'completed',
      notes: 'Sin azúcar',
    },
    {
      customerName: 'Sofía Gómez',
      coffeeType: 'Flat White',
      quantity: 2,
      status: 'pending',
      notes: 'Leche de avena',
    },
    {
      customerName: 'Alejandro Pérez',
      coffeeType: 'Cappuccino Vainilla',
      quantity: 1,
      status: 'pending',
      notes: 'Canela extra',
    },
    {
      customerName: 'Valeria Ramos',
      coffeeType: 'Cold Brew',
      quantity: 1,
      status: 'completed',
      notes: 'Hielo extra',
    },
    {
      customerName: 'Martín Silva',
      coffeeType: 'Latte Caramelo',
      quantity: 1,
      status: 'cancelled',
      notes: 'Cliente canceló el pedido',
    },
  ])

  await db.insert(chatMessages).values([
    {
      sessionId: 'demo-session-1',
      role: 'user',
      content: '¡Hola! ¿Qué tipos de café tienen disponibles?',
    },
    {
      sessionId: 'demo-session-1',
      role: 'assistant',
      content: '¡Hola! Tenemos Espresso, Flat White, Cappuccino, Latte, Cold Brew y más. ¿Te gustaría ordenar alguno?',
    },
  ])

  console.log('✅ Seeding completed successfully!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err)
  process.exit(1)
})
