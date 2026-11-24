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
      name: 'Espresso Doble',
      category: 'Café Caliente',
      price: '3.75',
      description: 'Shot doble de café de especialidad 100% Arábica',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-prod-2',
      name: 'Flat White',
      category: 'Café Caliente',
      price: '4.50',
      description: 'Doble ristretto con microespuma sedosa',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-prod-3',
      name: 'Cappuccino Vainilla',
      category: 'Especialidades',
      price: '4.75',
      description: 'Espresso, leche texturizada y jarabe artesanal de vainilla',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-prod-4',
      name: 'Cold Brew Naranja',
      category: 'Café Frío',
      price: '4.95',
      description: 'Extracción en frío por 18 horas con toque cítrico',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-prod-5',
      name: 'Matcha Latte Ceremonial',
      category: 'Sin Café',
      price: '5.25',
      description: 'Té verde matcha japonés grado ceremonial con leche de avena',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-prod-6',
      name: 'Croissant de Almendras',
      category: 'Panadería',
      price: '3.80',
      description: 'Horneado diariamente con crema frangipane y almendras tostadas',
      available: true,
      createdAt: now,
      updatedAt: now,
    },
  ]

  const customers: Customer[] = [
    {
      id: 'g-cust-1',
      name: 'Invitado Demo (Sesión Local)',
      email: 'demo@invitado.local',
      phone: '+52 55 0000 0001',
      favoriteDrink: 'Flat White',
      loyaltyPoints: 50,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'g-cust-2',
      name: 'Sofía Ramírez',
      email: 'sofia@ejemplo.com',
      phone: '+52 55 1234 5678',
      favoriteDrink: 'Matcha Latte Ceremonial',
      loyaltyPoints: 120,
      createdAt: now,
      updatedAt: now,
    },
  ]

  const orders: Order[] = [
    {
      id: 'g-ord-1',
      customerId: 'g-cust-1',
      customerName: 'Invitado Demo (Sesión Local)',
      status: 'pending',
      totalAmount: '8.30',
      notes: 'Orden de prueba guardada en sessionStorage del navegador',
      items: [
        {
          id: 'g-item-1',
          orderId: 'g-ord-1',
          productId: 'g-prod-2',
          productName: 'Flat White',
          quantity: 1,
          unitPrice: '4.50',
          notes: 'Leche de almendras',
        },
        {
          id: 'g-item-2',
          orderId: 'g-ord-1',
          productId: 'g-prod-6',
          productName: 'Croissant de Almendras',
          quantity: 1,
          unitPrice: '3.80',
          notes: 'Caliente',
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
    if (idx === -1) throw new Error('Orden no encontrada en la sesión local')
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
    if (idx === -1) throw new Error('Producto no encontrado en la sesión local')
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
    if (idx === -1) throw new Error('Cliente no encontrado en la sesión local')
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
