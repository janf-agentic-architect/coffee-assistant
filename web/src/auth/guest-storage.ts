import type { Order, Product, Customer } from '../components/OrdersDashboard'

const GUEST_DB_STORAGE_KEY = 'coffee_guest_session_db_v1'

interface GuestDatabase {
  orders: Order[]
  products: Product[]
  customers: Customer[]
}

function createInitialGuestDb(): GuestDatabase {
  const now = new Date().toISOString()
  const products: Product[] = [
    {
      id: 'g-prod-1',
      name: 'Double Espresso',
      category: 'Hot Coffee',
      price: '3.75',
      description: 'Double shot of 100% Arabica specialty coffee',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-prod-2',
      name: 'Flat White',
      category: 'Hot Coffee',
      price: '4.50',
      description: 'Double ristretto with silky microfoam',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-prod-3',
      name: 'Vanilla Cappuccino',
      category: 'Specialties',
      price: '4.75',
      description: 'Espresso, textured milk, and house-made vanilla syrup',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-prod-4',
      name: 'Orange Cold Brew',
      category: 'Cold Coffee',
      price: '4.95',
      description: '18-hour cold brew extraction with a citrus twist',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-prod-5',
      name: 'Ceremonial Matcha Latte',
      category: 'Coffee-Free',
      price: '5.25',
      description: 'Ceremonial-grade Japanese green matcha tea with oat milk',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-prod-6',
      name: 'Almond Croissant',
      category: 'Bakery',
      price: '3.80',
      description: 'Baked daily with frangipane cream and toasted almonds',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
  ]

  const customers: Customer[] = [
    {
      id: 'g-cust-1',
      name: 'Guest Demo (Local Session)',
      email: 'demo@guest.local',
      phone: '+1 555 000 0001',
      favoriteDrink: 'Flat White',
      loyaltyPoints: 50,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-cust-2',
      name: 'Sofia Ramirez',
      email: 'sofia@example.com',
      phone: '+1 555 123 4567',
      favoriteDrink: 'Ceremonial Matcha Latte',
      loyaltyPoints: 120,
      createdAt: now,
      updatedAt: now,
    },
  ]

  const orders: Order[] = [
    {
      id: 'g-ord-1',
      customerId: 'g-cust-1',
      customerName: 'Guest Demo (Local Session)',
      status: 'pending',
      totalAmount: '8.30',
      notes: 'Test order saved in browser sessionStorage',
      items: [
        {
          id: 'g-item-1',
          orderId: 'g-ord-1',
          productId: 'g-prod-2',
          productName: 'Flat White',
          quantity: 1,
          unitPrice: '4.50',
          notes: 'Almond milk',
        },
        {
          id: 'g-item-2',
          orderId: 'g-ord-1',
          productId: 'g-prod-6',
          productName: 'Almond Croissant',
          quantity: 1,
          unitPrice: '3.80',
          notes: 'Warmed',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ]

  return { orders, products, customers }
}

function loadDb(): GuestDatabase {
  if (typeof window === 'undefined') return createInitialGuestDb()
  try {
    const raw = window.sessionStorage.getItem(GUEST_DB_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as GuestDatabase
      if (parsed && Array.isArray(parsed.orders) && Array.isArray(parsed.products)) {
        return parsed
      }
    }
  } catch {
    // Fallback
  }
  const initial = createInitialGuestDb()
  saveDb(initial)
  return initial
}

function saveDb(db: GuestDatabase): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(GUEST_DB_STORAGE_KEY, JSON.stringify(db))
  } catch {
    // Ignore storage quota errors
  }
}

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export const guestStorage = {
  getAll(): GuestDatabase {
    return loadDb()
  },

  resetDemoData(): GuestDatabase {
    const fresh = createInitialGuestDb()
    saveDb(fresh)
    return fresh
  },

  createOrder(payload: {
    customerId?: string | null
    customerName: string
    totalAmount: string
    notes?: string
    status?: string
    items: Array<{
      productId?: string | null
      productName: string
      quantity: number
      unitPrice: string
      notes?: string | null
    }>
  }): Order {
    const db = loadDb()
    const now = new Date().toISOString()
    const orderId = randomId('g_ord')
    const newOrder: Order = {
      id: orderId,
      customerId: payload.customerId || null,
      customerName: payload.customerName,
      status: payload.status || 'pending',
      totalAmount: payload.totalAmount,
      notes: payload.notes || null,
      items: payload.items.map((item) => ({
        id: randomId('g_item'),
        orderId,
        productId: item.productId || null,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        notes: item.notes || null,
      })),
      createdAt: now,
      updatedAt: now,
    }
    db.orders = [newOrder, ...db.orders]
    saveDb(db)
    return newOrder
  },

  updateOrderStatus(id: string, status: string): Order {
    const db = loadDb()
    const idx = db.orders.findIndex((o) => o.id === id)
    if (idx === -1) throw new Error('Order not found in local session')
    const updated: Order = {
      ...db.orders[idx],
      status,
      updatedAt: new Date().toISOString(),
    }
    db.orders[idx] = updated
    saveDb(db)
    return updated
  },

  deleteOrder(id: string): void {
    const db = loadDb()
    db.orders = db.orders.filter((o) => o.id !== id)
    saveDb(db)
  },

  createProduct(payload: {
    name: string
    category: string
    price: string
    description?: string | null
    available: boolean
  }): Product {
    const db = loadDb()
    const now = new Date().toISOString()
    const newProduct: Product = {
      id: randomId('g_prod'),
      name: payload.name,
      category: payload.category,
      price: payload.price,
      description: payload.description || null,
      available: payload.available,
      createdAt: now,
      updatedAt: now,
    }
    db.products = [...db.products, newProduct]
    saveDb(db)
    return newProduct
  },

  updateProduct(
    id: string,
    payload: {
      name?: string
      category?: string
      price?: string
      description?: string | null
      available?: boolean
    }
  ): Product {
    const db = loadDb()
    const idx = db.products.findIndex((p) => p.id === id)
    if (idx === -1) throw new Error('Product not found in local session')
    const current = db.products[idx]
    const updated: Product = {
      ...current,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.category !== undefined ? { category: payload.category } : {}),
      ...(payload.price !== undefined ? { price: payload.price } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.available !== undefined ? { available: payload.available } : {}),
      updatedAt: new Date().toISOString(),
    }
    db.products[idx] = updated
    saveDb(db)
    return updated
  },

  updateProductAvailability(id: string, available: boolean): Product {
    return this.updateProduct(id, { available })
  },

  deleteProduct(id: string): void {
    const db = loadDb()
    db.products = db.products.filter((p) => p.id !== id)
    saveDb(db)
  },

  createCustomer(payload: {
    name: string
    email?: string
    phone?: string
    favoriteDrink?: string
    loyaltyPoints: number
  }): Customer {
    const db = loadDb()
    const now = new Date().toISOString()
    const newCustomer: Customer = {
      id: randomId('g_cust'),
      name: payload.name,
      email: payload.email || null,
      phone: payload.phone || null,
      favoriteDrink: payload.favoriteDrink || null,
      loyaltyPoints: payload.loyaltyPoints,
      createdAt: now,
      updatedAt: now,
    }
    db.customers = [newCustomer, ...db.customers]
    saveDb(db)
    return newCustomer
  },

  updateCustomerPoints(id: string, loyaltyPoints: number): Customer {
    const db = loadDb()
    const idx = db.customers.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('Customer not found in local session')
    const updated: Customer = {
      ...db.customers[idx],
      loyaltyPoints,
      updatedAt: new Date().toISOString(),
    }
    db.customers[idx] = updated
    saveDb(db)
    return updated
  },

  deleteCustomer(id: string): void {
    const db = loadDb()
    db.customers = db.customers.filter((c) => c.id !== id)
    saveDb(db)
  },
}
