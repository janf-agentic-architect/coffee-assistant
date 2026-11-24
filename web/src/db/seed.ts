import 'dotenv/config'
import {
  getDb,
  ensureMultiTenantSchema,
  businesses,
  coffeeOrders,
  orderItems,
  products,
  customers,
} from './index'

export const DEFAULT_DEMO_BUSINESS_ID = '00000000-0000-0000-0000-000000000001'
export const DEFAULT_DEMO_OWNER_UID = 'usr_demo_business'

async function seed() {
  console.log('🌱 Seeding database...')
  const db = getDb()
  await ensureMultiTenantSchema(db)

  // Clear existing data in dependency order
  await db.delete(orderItems)
  await db.delete(coffeeOrders)
  await db.delete(customers)
  await db.delete(products)
  await db.delete(businesses)

  const [demoBusiness] = await db
    .insert(businesses)
    .values({
      id: DEFAULT_DEMO_BUSINESS_ID,
      ownerUserId: DEFAULT_DEMO_OWNER_UID,
      name: 'The Cloud Cafe',
    })
    .returning()

  const insertedProducts = await db
    .insert(products)
    .values([
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Espresso',
        category: 'Hot Coffee',
        price: '3.00',
        description: 'Rich freshly ground 100% Arabica espresso shot',
        available: true,
      },
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Double Espresso',
        category: 'Hot Coffee',
        price: '3.75',
        description: 'Double shot of espresso with thick crema',
        available: true,
      },
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Flat White',
        category: 'Hot Coffee',
        price: '4.50',
        description: 'Double ristretto with silky steamed microfoam',
        available: true,
      },
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Vanilla Cappuccino',
        category: 'Specialties',
        price: '4.75',
        description: 'Espresso, steamed milk, creamy foam, and a hint of vanilla',
        available: true,
      },
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Caramel Latte',
        category: 'Specialties',
        price: '5.00',
        description: 'Smooth espresso with creamy milk and house-made caramel syrup',
        available: true,
      },
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Cold Brew',
        category: 'Cold Coffee',
        price: '4.50',
        description: '18-hour cold-steeped coffee, smooth and refreshing',
        available: true,
      },
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Matcha Latte',
        category: 'Coffee-Free',
        price: '5.25',
        description: 'Ceremonial Japanese green matcha tea with your choice of milk',
        available: true,
      },
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Almond Croissant',
        category: 'Bakery',
        price: '3.80',
        description: 'Artisanal flaky pastry filled with toasted almond cream',
        available: true,
      },
    ])
    .returning()

  const productByName = Object.fromEntries(insertedProducts.map((p) => [p.name, p]))

  const insertedCustomers = await db
    .insert(customers)
    .values([
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Carlos Mendoza',
        email: 'carlos.mendoza@email.com',
        phone: '+1 555 123 4567',
        favoriteDrink: 'Double Espresso',
        loyaltyPoints: 120,
      },
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Sofia Gomez',
        email: 'sofia.gomez@email.com',
        phone: '+1 555 876 5432',
        favoriteDrink: 'Flat White',
        loyaltyPoints: 245,
      },
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Alex Perez',
        email: 'alex.perez@email.com',
        phone: '+1 555 345 6789',
        favoriteDrink: 'Vanilla Cappuccino',
        loyaltyPoints: 80,
      },
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Valeria Ramos',
        email: 'valeria.ramos@email.com',
        phone: '+1 555 901 2345',
        favoriteDrink: 'Cold Brew',
        loyaltyPoints: 310,
      },
      {
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
        name: 'Martin Silva',
        email: 'martin.silva@email.com',
        phone: '+1 555 654 3210',
        favoriteDrink: 'Caramel Latte',
        loyaltyPoints: 45,
      },
    ])
    .returning()

  const customerByName = Object.fromEntries(insertedCustomers.map((c) => [c.name, c]))

  const sampleOrders = [
    {
      customerName: 'Carlos Mendoza',
      status: 'completed',
      notes: 'For here at the bar',
      items: [
        { name: 'Double Espresso', quantity: 1, notes: 'No sugar' },
        { name: 'Almond Croissant', quantity: 1 },
      ],
    },
    {
      customerName: 'Sofia Gomez',
      status: 'pending',
      notes: 'To go',
      items: [
        { name: 'Flat White', quantity: 2, notes: 'Oat milk' },
        { name: 'Matcha Latte', quantity: 1, notes: 'Almond milk' },
      ],
    },
    {
      customerName: 'Alex Perez',
      status: 'pending',
      notes: 'Extra cinnamon',
      items: [{ name: 'Vanilla Cappuccino', quantity: 1 }],
    },
    {
      customerName: 'Valeria Ramos',
      status: 'completed',
      notes: 'Extra ice',
      items: [
        { name: 'Cold Brew', quantity: 2 },
        { name: 'Almond Croissant', quantity: 2 },
      ],
    },
    {
      customerName: 'Martin Silva',
      status: 'cancelled',
      notes: 'Customer cancelled the order',
      items: [{ name: 'Caramel Latte', quantity: 1 }],
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
        businessId: demoBusiness.id,
        userId: demoBusiness.ownerUserId,
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
