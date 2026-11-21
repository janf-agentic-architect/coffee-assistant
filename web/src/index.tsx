import { Hono, type Context } from 'hono'
import { eq, and, desc, asc, inArray } from 'drizzle-orm'
import { renderer } from './renderer'
import { Dashboard } from './components/Dashboard'
import { getGcpAccessToken } from './gcp-auth'
import {
  registerWithEmailPassword,
  signInWithEmailPassword,
  verifyIdentityToken,
  type AuthUserProfile,
} from './gcp-identity'
import {
  getDb,
  ensureMultiTenantSchema,
  coffeeOrders,
  orderItems,
  products,
  customers,
} from './db'

type Bindings = {
  AGENT_RUNTIME_API_URL?: string
  GCP_SA_KEY_JSON?: string
  DATABASE_URL?: string
  GCP_IDENTITY_API_KEY?: string
  GCP_PROJECT_ID?: string
  AUTH_LOCAL_SECRET?: string
}

const app = new Hono<{ Bindings: Bindings }>()

async function getAuthenticatedUser(
  c: Context<{ Bindings: Bindings }>
): Promise<AuthUserProfile | null> {
  const authHeader = c.req.header('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return null

  return verifyIdentityToken(token, {
    gcpProjectId: c.env?.GCP_PROJECT_ID || process.env.GCP_PROJECT_ID,
    gcpApiKey: c.env?.GCP_IDENTITY_API_KEY || process.env.GCP_IDENTITY_API_KEY,
    localSecret: c.env?.AUTH_LOCAL_SECRET || process.env.AUTH_LOCAL_SECRET,
  })
}

// ================= GCP IDENTITY PLATFORM AUTH ENDPOINTS =================
app.get('/api/auth/config', (c) => {
  const apiKey = c.env?.GCP_IDENTITY_API_KEY || process.env.GCP_IDENTITY_API_KEY
  const projectId = c.env?.GCP_PROJECT_ID || process.env.GCP_PROJECT_ID
  return c.json({
    provider: apiKey ? 'gcp-identity-platform' : 'local-dev',
    projectId: projectId || null,
    guestModeEnabled: true,
    whatsappSessionSeparation: true,
  })
})

app.post('/api/auth/register', async (c) => {
  try {
    const body = await c.req.json()
    const email = String(body.email || '').trim()
    const password = String(body.password || '')
    const displayName = body.displayName ? String(body.displayName).trim() : undefined

    if (!email || !password) {
      return c.json({ error: 'Debes proporcionar correo electrónico y contraseña.' }, 400)
    }

    const result = await registerWithEmailPassword({
      email,
      password,
      displayName,
      gcpApiKey: c.env?.GCP_IDENTITY_API_KEY || process.env.GCP_IDENTITY_API_KEY,
      localSecret: c.env?.AUTH_LOCAL_SECRET || process.env.AUTH_LOCAL_SECRET,
    })

    return c.json(result, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al registrar usuario'
    return c.json({ error: message }, 400)
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json()
    const email = String(body.email || '').trim()
    const password = String(body.password || '')

    if (!email || !password) {
      return c.json({ error: 'Debes proporcionar correo electrónico y contraseña.' }, 400)
    }

    const result = await signInWithEmailPassword({
      email,
      password,
      gcpApiKey: c.env?.GCP_IDENTITY_API_KEY || process.env.GCP_IDENTITY_API_KEY,
      localSecret: c.env?.AUTH_LOCAL_SECRET || process.env.AUTH_LOCAL_SECRET,
    })

    return c.json(result, 200)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al iniciar sesión'
    return c.json({ error: message }, 401)
  }
})

app.get('/api/auth/me', async (c) => {
  const user = await getAuthenticatedUser(c)
  if (!user) {
    return c.json({ authenticated: false, user: null }, 401)
  }
  return c.json({ authenticated: true, user }, 200)
})

app.all('/api/adk/*', async (c) => {
  const url = new URL(c.req.url)
  const subPath = url.pathname.replace(/^\/api\/adk/, '')
  const baseUrl = (c.env?.AGENT_RUNTIME_API_URL || 'http://localhost:8080').replace(/\/$/, '')
  const targetUrl = `${baseUrl}${subPath}${url.search}`

  const headers = new Headers()
  const contentType = c.req.header('content-type')
  if (contentType) headers.set('content-type', contentType)
  const accept = c.req.header('accept')
  if (accept) headers.set('accept', accept)

  if (c.env?.GCP_SA_KEY_JSON) {
    const token = await getGcpAccessToken(c.env.GCP_SA_KEY_JSON)
    headers.set('Authorization', `Bearer ${token}`)
  }

  try {
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
    })

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    return new Response(
      JSON.stringify({
        error: `Agent backend unreachable on ${baseUrl}. Start it with 'make dev-agent' or 'uv run uvicorn app.fast_api_app:app --port 8080'`,
        details: message,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
})

// ================= MULTI-TENANT DATABASE ENDPOINTS (ISOLATED BY user.uid) =================

// Orders + Order Items
app.get('/api/orders', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const ordersList = await db
      .select()
      .from(coffeeOrders)
      .where(eq(coffeeOrders.userId, user.uid))
      .orderBy(desc(coffeeOrders.createdAt))

    if (ordersList.length === 0) return c.json([])

    const orderIds = ordersList.map((o) => o.id)
    const itemsList = await db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds))

    const itemsByOrder = new Map<string, typeof itemsList>()
    for (const item of itemsList) {
      const existing = itemsByOrder.get(item.orderId) || []
      existing.push(item)
      itemsByOrder.set(item.orderId, existing)
    }

    const enriched = ordersList.map((order) => ({
      ...order,
      items: itemsByOrder.get(order.id) || [],
    }))

    return c.json(enriched)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.post('/api/orders', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const rawItems: Array<{
      productId?: string | null
      productName: string
      quantity?: number
      unitPrice?: string | number
      notes?: string | null
    }> = Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : body.coffeeType
      ? [{ productName: body.coffeeType, quantity: body.quantity ?? 1, unitPrice: body.unitPrice ?? '0.00' }]
      : []

    if (rawItems.length === 0) {
      return c.json({ error: 'Order must contain at least one product item' }, 400)
    }

    const computedTotal = rawItems.reduce((sum, item) => {
      const qty = Math.max(1, Number(item.quantity) || 1)
      const price = Number(item.unitPrice) || 0
      return sum + qty * price
    }, 0)

    const [newOrder] = await db
      .insert(coffeeOrders)
      .values({
        userId: user.uid,
        customerId: body.customerId || null,
        customerName: body.customerName,
        totalAmount: body.totalAmount !== undefined ? String(body.totalAmount) : computedTotal.toFixed(2),
        notes: body.notes || null,
        status: body.status ?? 'pending',
      })
      .returning()

    const insertedItems = await db
      .insert(orderItems)
      .values(
        rawItems.map((item) => ({
          orderId: newOrder.id,
          productId: item.productId || null,
          productName: item.productName,
          quantity: Math.max(1, Number(item.quantity) || 1),
          unitPrice: String(Number(item.unitPrice || 0).toFixed(2)),
          notes: item.notes || null,
        }))
      )
      .returning()

    return c.json({ ...newOrder, items: insertedItems }, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 400)
  }
})

app.get('/api/orders/:id', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const id = c.req.param('id')
    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const [order] = await db
      .select()
      .from(coffeeOrders)
      .where(and(eq(coffeeOrders.id, id), eq(coffeeOrders.userId, user.uid)))
    if (!order) return c.json({ error: 'Order not found' }, 404)
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id))
    return c.json({ ...order, items })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.patch('/api/orders/:id', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const id = c.req.param('id')
    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const [updated] = await db
      .update(coffeeOrders)
      .set({
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.totalAmount !== undefined ? { totalAmount: String(body.totalAmount) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(coffeeOrders.id, id), eq(coffeeOrders.userId, user.uid)))
      .returning()
    if (!updated) return c.json({ error: 'Order not found' }, 404)
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, id))
    return c.json({ ...updated, items })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.delete('/api/orders/:id', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const id = c.req.param('id')
    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const [deleted] = await db
      .delete(coffeeOrders)
      .where(and(eq(coffeeOrders.id, id), eq(coffeeOrders.userId, user.uid)))
      .returning()
    if (!deleted) return c.json({ error: 'Order not found' }, 404)
    return c.json({ success: true, deleted })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

// Products (Isolated by user.uid)
app.get('/api/products', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const items = await db
      .select()
      .from(products)
      .where(eq(products.userId, user.uid))
      .orderBy(asc(products.name))
    return c.json(items)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.post('/api/products', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const [newProduct] = await db
      .insert(products)
      .values({
        userId: user.uid,
        name: body.name,
        category: body.category || 'Café Caliente',
        price: String(body.price ?? '0.00'),
        description: body.description,
        available: body.available !== undefined ? Boolean(body.available) : true,
      })
      .returning()
    return c.json(newProduct, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 400)
  }
})

app.patch('/api/products/:id', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const id = c.req.param('id')
    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const [updated] = await db
      .update(products)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.price !== undefined ? { price: String(body.price) } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.available !== undefined ? { available: Boolean(body.available) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(products.id, id), eq(products.userId, user.uid)))
      .returning()
    if (!updated) return c.json({ error: 'Product not found' }, 404)
    return c.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.delete('/api/products/:id', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const id = c.req.param('id')
    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const [deleted] = await db
      .delete(products)
      .where(and(eq(products.id, id), eq(products.userId, user.uid)))
      .returning()
    if (!deleted) return c.json({ error: 'Product not found' }, 404)
    return c.json({ success: true, deleted })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

// Customers (Isolated by user.uid)
app.get('/api/customers', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const items = await db
      .select()
      .from(customers)
      .where(eq(customers.userId, user.uid))
      .orderBy(desc(customers.loyaltyPoints), asc(customers.name))
    return c.json(items)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.post('/api/customers', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const [newCustomer] = await db
      .insert(customers)
      .values({
        userId: user.uid,
        name: body.name,
        email: body.email || null,
        phone: body.phone || null,
        favoriteDrink: body.favoriteDrink || null,
        loyaltyPoints: Number(body.loyaltyPoints) || 0,
      })
      .returning()
    return c.json(newCustomer, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 400)
  }
})

app.patch('/api/customers/:id', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const id = c.req.param('id')
    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const [updated] = await db
      .update(customers)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.favoriteDrink !== undefined ? { favoriteDrink: body.favoriteDrink } : {}),
        ...(body.loyaltyPoints !== undefined ? { loyaltyPoints: Number(body.loyaltyPoints) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(customers.id, id), eq(customers.userId, user.uid)))
      .returning()
    if (!updated) return c.json({ error: 'Customer not found' }, 404)
    return c.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.delete('/api/customers/:id', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'No autenticado' }, 401)

    const id = c.req.param('id')
    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const [deleted] = await db
      .delete(customers)
      .where(and(eq(customers.id, id), eq(customers.userId, user.uid)))
      .returning()
    if (!deleted) return c.json({ error: 'Customer not found' }, 404)
    return c.json({ success: true, deleted })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.use(renderer)

app.get('/', async (c) => {
  return c.render(
    <main class="app-layout">
      <Dashboard />
    </main>
  )
})

export default app
