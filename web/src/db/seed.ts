import 'dotenv/config'
import { getDb, coffeeOrders, orderItems, products, customers } from './index'

async function seed() {
  console.log('🌱 Seeding database...')
  const db = getDb()

  // Clear existing data in dependency order
  await db.delete(orderItems)
  await db.delete(coffeeOrders)
  await db.delete(customers)
  await db.delete(products)

  const insertedProducts = await db
    .insert(products)
    .values([
      {
        name: 'Espresso',
        category: 'Café Caliente',
        price: '3.00',
        description: 'Shot intenso de café 100% arábica recién molido',
        available: true,
      },
      {
        name: 'Espresso Doble',
        category: 'Café Caliente',
        price: '3.75',
        description: 'Doble carga de espresso con crema densa',
        available: true,
      },
      {
        name: 'Flat White',
        category: 'Café Caliente',
        price: '4.50',
        description: 'Doble ristretto con microespuma sedosa de leche',
        available: true,
      },
      {
        name: 'Cappuccino Vainilla',
        category: 'Especialidades',
        price: '4.75',
        description: 'Espresso, leche vaporizada, espuma cremosa y toque de vainilla',
        available: true,
      },
      {
        name: 'Latte Caramelo',
        category: 'Especialidades',
        price: '5.00',
        description: 'Espresso suave con leche cremosa y jarabe artesanal de caramelo',
        available: true,
      },
      {
        name: 'Cold Brew',
        category: 'Café Frío',
        price: '4.50',
        description: 'Infusión en frío durante 18 horas, suave y refrescante',
        available: true,
      },
      {
        name: 'Matcha Latte',
        category: 'Sin Café',
        price: '5.25',
        description: 'Té verde matcha ceremonial japonés con leche a elección',
        available: true,
      },
      {
        name: 'Croissant de Almendras',
        category: 'Panadería',
        price: '3.80',
        description: 'Hojaldre artesanal relleno de crema de almendras tostadas',
        available: true,
      },
    ])
    .returning()

  const productByName = Object.fromEntries(insertedProducts.map((p) => [p.name, p]))

  const insertedCustomers = await db
    .insert(customers)
    .values([
      {
        name: 'Carlos Mendoza',
        email: 'carlos.mendoza@email.com',
        phone: '+52 55 1234 5678',
        favoriteDrink: 'Espresso Doble',
        loyaltyPoints: 120,
      },
      {
        name: 'Sofía Gómez',
        email: 'sofia.gomez@email.com',
        phone: '+52 55 8765 4321',
        favoriteDrink: 'Flat White',
        loyaltyPoints: 245,
      },
      {
        name: 'Alejandro Pérez',
        email: 'alejandro.perez@email.com',
        phone: '+52 55 3456 7890',
        favoriteDrink: 'Cappuccino Vainilla',
        loyaltyPoints: 80,
      },
      {
        name: 'Valeria Ramos',
        email: 'valeria.ramos@email.com',
        phone: '+52 55 9012 3456',
        favoriteDrink: 'Cold Brew',
        loyaltyPoints: 310,
      },
      {
        name: 'Martín Silva',
        email: 'martin.silva@email.com',
        phone: '+52 55 6543 2109',
        favoriteDrink: 'Latte Caramelo',
        loyaltyPoints: 45,
      },
    ])
    .returning()

  const customerByName = Object.fromEntries(insertedCustomers.map((c) => [c.name, c]))

  const sampleOrders = [
    {
      customerName: 'Carlos Mendoza',
      status: 'completed',
      notes: 'Para tomar en barra',
      items: [
        { name: 'Espresso Doble', quantity: 1, notes: 'Sin azúcar' },
        { name: 'Croissant de Almendras', quantity: 1 },
      ],
    },
    {
      customerName: 'Sofía Gómez',
      status: 'pending',
      notes: 'Para llevar',
      items: [
        { name: 'Flat White', quantity: 2, notes: 'Leche de avena' },
        { name: 'Matcha Latte', quantity: 1, notes: 'Leche de almendras' },
      ],
    },
    {
      customerName: 'Alejandro Pérez',
      status: 'pending',
      notes: 'Canela extra',
      items: [{ name: 'Cappuccino Vainilla', quantity: 1 }],
    },
    {
      customerName: 'Valeria Ramos',
      status: 'completed',
      notes: 'Hielo extra',
      items: [
        { name: 'Cold Brew', quantity: 2 },
        { name: 'Croissant de Almendras', quantity: 2 },
      ],
    },
    {
      customerName: 'Martín Silva',
      status: 'cancelled',
      notes: 'Cliente canceló el pedido',
      items: [{ name: 'Latte Caramelo', quantity: 1 }],
    },
  ]

  for (const sOrder of sampleOrders) {
    const cust = customerByName[sOrder.customerName]
    const total = sOrder.items.reduce((acc, item) => {
      const prod = productByName[item.name]
      const price = prod ? Number(prod.price) : 4.0
      return acc + price * item.quantity
    }, 0)

    const [createdOrder] = await db
      .insert(coffeeOrders)
      .values({
        customerId: cust?.id ?? null,
        customerName: sOrder.customerName,
        status: sOrder.status,
        totalAmount: total.toFixed(2),
        notes: sOrder.notes,
      })
      .returning()

    await db.insert(orderItems).values(
      sOrder.items.map((item) => {
        const prod = productByName[item.name]
        return {
          orderId: createdOrder.id,
          productId: prod?.id ?? null,
          productName: item.name,
          quantity: item.quantity,
          unitPrice: prod ? prod.price : '4.00',
          notes: item.notes ?? null,
        }
      })
    )
  }

  console.log('✅ Seeding completed successfully!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err)
  process.exit(1)
})
