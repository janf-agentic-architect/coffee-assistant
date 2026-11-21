import 'dotenv/config'
import { getDb, coffeeOrders, products, customers } from './index'

async function seed() {
  console.log('🌱 Seeding database...')
  const db = getDb()

  await db.insert(products).values([
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
      available: false,
    },
  ])

  await db.insert(customers).values([
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

  console.log('✅ Seeding completed successfully!')
  process.exit(0)
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err)
  process.exit(1)
})
