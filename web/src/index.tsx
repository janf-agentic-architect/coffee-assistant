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
  getOrCreateBusinessForUser,
  listBusinessesForUser,
  resolveActiveBusinessForUser,
  businesses,
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
      return c.json({ error: 'You must provide an email and password.' }, 400)
    }

    const result = await registerWithEmailPassword({
      email,
      password,
      displayName,
      gcpApiKey: c.env?.GCP_IDENTITY_API_KEY || process.env.GCP_IDENTITY_API_KEY,
      localSecret: c.env?.AUTH_LOCAL_SECRET || process.env.AUTH_LOCAL_SECRET,
    })

    let businessId: string | undefined
    try {
      const db = getDb(c.env?.DATABASE_URL)
      const business = await getOrCreateBusinessForUser(db, result.user)
      businessId = business.id
    } catch {
      // Allow auth even if local DB is not running yet
    }

    return c.json(
      {
        ...result,
        user: { ...result.user, businessId },
      },
      201
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error registering user'
    return c.json({ error: message }, 400)
  }
})

app.post('/api/auth/login', async (c) => {
  try {
    const body = await c.req.json()
    const email = String(body.email || '').trim()
    const password = String(body.password || '')

    if (!email || !password) {
      return c.json({ error: 'You must provide an email and password.' }, 400)
    }

    const result = await signInWithEmailPassword({
      email,
      password,
      gcpApiKey: c.env?.GCP_IDENTITY_API_KEY || process.env.GCP_IDENTITY_API_KEY,
      localSecret: c.env?.AUTH_LOCAL_SECRET || process.env.AUTH_LOCAL_SECRET,
    })

    let businessId: string | undefined
    try {
      const db = getDb(c.env?.DATABASE_URL)
      const business = await getOrCreateBusinessForUser(db, result.user)
      businessId = business.id
    } catch {
      // Allow auth even if local DB is not running yet
    }

    return c.json(
      {
        ...result,
        user: { ...result.user, businessId },
      },
      200
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error signing in'
    return c.json({ error: message }, 401)
  }
})

app.get('/api/auth/me', async (c) => {
  const user = await getAuthenticatedUser(c)
  if (!user) {
    return c.json({ authenticated: false, user: null }, 401)
  }
  let business = null
  try {
    const db = getDb(c.env?.DATABASE_URL)
    business = await getOrCreateBusinessForUser(db, user)
  } catch {
    // Ignore DB errors
  }
  return c.json(
    {
      authenticated: true,
      user: { ...user, businessId: business?.id },
      business,
    },
    200
  )
})

function getRequestedBusinessId(c: Context<{ Bindings: Bindings }>): string | null {
  const fromHeader = c.req.header('x-business-id')?.trim()
  if (fromHeader) return fromHeader
  const fromQuery = c.req.query('businessId')?.trim()
  return fromQuery || null
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { code?: string; cause?: { code?: string }; message?: string }
  return (
    err.code === '23505' ||
    err.cause?.code === '23505' ||
    (typeof err.message === 'string' && err.message.includes('23505'))
  )
}

app.get('/api/businesses', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const db = getDb(c.env?.DATABASE_URL)
    const list = await listBusinessesForUser(db, user)
    return c.json(list)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.post('/api/businesses', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const body = await c.req.json()
    const name = String(body.name || '').trim()
    if (!name) {
      return c.json({ error: 'Business name is required.' }, 400)
    }

    const description =
      body.description !== undefined && String(body.description).trim()
        ? String(body.description).trim()
        : null
    const assistantInstructions =
      body.assistantInstructions !== undefined && String(body.assistantInstructions).trim()
        ? String(body.assistantInstructions).trim()
        : null
    const whatsappPhoneNumberId =
      body.whatsappPhoneNumberId !== undefined && String(body.whatsappPhoneNumberId).trim()
        ? String(body.whatsappPhoneNumberId).trim()
        : null

    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const [created] = await db
      .insert(businesses)
      .values({
        ownerUserId: user.uid,
        name,
        description,
        assistantInstructions,
        whatsappPhoneNumberId,
      })
      .returning()

    return c.json(created, 201)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json(
        { error: 'That WhatsApp Phone Number ID is already assigned to another business.' },
        409
      )
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 400)
  }
})

app.patch('/api/businesses/:id', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    await ensureMultiTenantSchema(db)

    const updatePayload: Partial<typeof businesses.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) {
      const trimmedName = String(body.name).trim()
      if (!trimmedName) {
        return c.json({ error: 'Business name cannot be empty.' }, 400)
      }
      updatePayload.name = trimmedName
    }
    if (body.description !== undefined) {
      updatePayload.description = String(body.description || '').trim() || null
    }
    if (body.assistantInstructions !== undefined) {
      updatePayload.assistantInstructions =
        String(body.assistantInstructions || '').trim() || null
    }
    if (body.whatsappPhoneNumberId !== undefined) {
      updatePayload.whatsappPhoneNumberId =
        String(body.whatsappPhoneNumberId || '').trim() || null
    }

    const [updated] = await db
      .update(businesses)
      .set(updatePayload)
      .where(and(eq(businesses.id, id), eq(businesses.ownerUserId, user.uid)))
      .returning()

    if (!updated) return c.json({ error: 'Business not found' }, 404)
    return c.json(updated)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json(
        { error: 'That WhatsApp Phone Number ID is already assigned to another business.' },
        409
      )
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.delete('/api/businesses/:id', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const db = getDb(c.env?.DATABASE_URL)
    const userBusinesses = await listBusinessesForUser(db, user)

    if (userBusinesses.length <= 1) {
      return c.json(
        { error: 'You must keep at least one active business in your account.' },
        400
      )
    }

    const [deleted] = await db
      .delete(businesses)
      .where(and(eq(businesses.id, id), eq(businesses.ownerUserId, user.uid)))
      .returning()

    if (!deleted) return c.json({ error: 'Business not found' }, 404)
    return c.json({ success: true, deleted })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.get('/api/business', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))
    return c.json(business)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.patch('/api/business', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const [updated] = await db
      .update(businesses)
      .set({
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
        ...(body.description !== undefined
          ? { description: String(body.description || '').trim() || null }
          : {}),
        ...(body.assistantInstructions !== undefined
          ? { assistantInstructions: String(body.assistantInstructions || '').trim() || null }
          : {}),
        ...(body.whatsappPhoneNumberId !== undefined
          ? { whatsappPhoneNumberId: body.whatsappPhoneNumberId ? String(body.whatsappPhoneNumberId).trim() : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, business.id))
      .returning()

    return c.json(updated)
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json(
        { error: 'That WhatsApp Phone Number ID is already assigned to another business.' },
        409
      )
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

const DEFAULT_DEMO_BUSINESS_ID = '00000000-0000-0000-0000-000000000001'

app.all('/api/adk/*', async (c) => {
  const url = new URL(c.req.url)
  const subPath = url.pathname.replace(/^\/api\/adk/, '')
  const baseUrl = (c.env?.AGENT_RUNTIME_API_URL || 'http://localhost:8080').replace(/\/$/, '')
  const targetUrl = `${baseUrl}${subPath}${url.search}`

  // Resolve the active business from the authenticated owner (or fallback to the default demo business)
  let businessId = DEFAULT_DEMO_BUSINESS_ID
  let businessName = 'The Cloud Cafe'
  let businessDescription = ''
  let businessInstructions = ''
  let ownerUserId = 'usr_demo_business'
  try {
    const user = await getAuthenticatedUser(c)
    if (user) {
      ownerUserId = user.uid
      const db = getDb(c.env?.DATABASE_URL)
      const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))
      businessId = business.id
      businessName = business.name || 'My Coffee Shop'
      businessDescription = business.description || ''
      businessInstructions = business.assistantInstructions || ''
    }
  } catch {
    // Fallback to demo business if DB is temporarily unreachable
  }

  const headers = new Headers()
  const contentType = c.req.header('content-type')
  if (contentType) headers.set('content-type', contentType)
  const accept = c.req.header('accept')
  if (accept) headers.set('accept', accept)

  if (c.env?.GCP_SA_KEY_JSON) {
    const token = await getGcpAccessToken(c.env.GCP_SA_KEY_JSON)
    headers.set('Authorization', `Bearer ${token}`)
  }

  let requestBody: BodyInit | undefined = ['GET', 'HEAD'].includes(c.req.method)
    ? undefined
    : c.req.raw.body

  // Inject business context into stateDelta on /run_sse and /run (or initial state on session creation)
  if (c.req.method === 'POST' && contentType?.includes('application/json')) {
    try {
      const rawJson = (await c.req.json()) as Record<string, unknown>
      const businessState = {
        business_id: businessId,
        business_name: businessName,
        business_description: businessDescription,
        business_instructions: businessInstructions,
        user_id: ownerUserId,
        business_owner_id: ownerUserId,
      }
      if (subPath === '/run_sse' || subPath === '/run') {
        const existingDelta =
          (rawJson.stateDelta as Record<string, unknown> | undefined) ||
          (rawJson.state_delta as Record<string, unknown> | undefined) ||
          {}
        rawJson.stateDelta = {
          ...existingDelta,
          ...businessState,
        }
      } else if (/^\/apps\/[^/]+\/users\/[^/]+\/sessions$/.test(subPath)) {
        const existingState = (rawJson.state as Record<string, unknown> | undefined) || {}
        rawJson.state = {
          ...existingState,
          ...businessState,
        }
      }
      requestBody = JSON.stringify(rawJson)
    } catch {
      // Keep original body if not valid JSON
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers,
      body: requestBody,
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

// ================= MULTI-TENANT DATABASE ENDPOINTS (ISOLATED BY business.id) =================

// Orders + Order Items
app.get('/api/orders', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const ordersList = await db
      .select()
      .from(coffeeOrders)
      .where(eq(coffeeOrders.businessId, business.id))
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
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

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
        businessId: business.id,
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
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const [order] = await db
      .select()
      .from(coffeeOrders)
      .where(and(eq(coffeeOrders.id, id), eq(coffeeOrders.businessId, business.id)))
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
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const [updated] = await db
      .update(coffeeOrders)
      .set({
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.totalAmount !== undefined ? { totalAmount: String(body.totalAmount) } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(coffeeOrders.id, id), eq(coffeeOrders.businessId, business.id)))
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
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const [deleted] = await db
      .delete(coffeeOrders)
      .where(and(eq(coffeeOrders.id, id), eq(coffeeOrders.businessId, business.id)))
      .returning()
    if (!deleted) return c.json({ error: 'Order not found' }, 404)
    return c.json({ success: true, deleted })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

// Products (Isolated by business.id)
app.get('/api/products', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const items = await db
      .select()
      .from(products)
      .where(eq(products.businessId, business.id))
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
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const body = await c.req.json()
    const name = String(body.name || '').trim()
    if (!name) {
      return c.json({ error: 'Product name is required.' }, 400)
    }

    const category = String(body.category || '').trim() || 'Hot Coffee'
    const parsedPrice = Number(body.price ?? 0)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return c.json({ error: 'Price must be a valid number greater than or equal to 0.' }, 400)
    }
    const description =
      body.description !== undefined && String(body.description ?? '').trim()
        ? String(body.description).trim()
        : null

    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const [newProduct] = await db
      .insert(products)
      .values({
        businessId: business.id,
        userId: user.uid,
        name,
        category,
        price: parsedPrice.toFixed(2),
        description,
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
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const updatePayload: Partial<typeof products.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (body.name !== undefined) {
      const trimmedName = String(body.name).trim()
      if (!trimmedName) {
        return c.json({ error: 'Product name cannot be empty.' }, 400)
      }
      updatePayload.name = trimmedName
    }
    if (body.category !== undefined) {
      const trimmedCategory = String(body.category).trim()
      if (!trimmedCategory) {
        return c.json({ error: 'Product category cannot be empty.' }, 400)
      }
      updatePayload.category = trimmedCategory
    }
    if (body.price !== undefined) {
      const parsedPrice = Number(body.price)
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return c.json({ error: 'Price must be a valid number greater than or equal to 0.' }, 400)
      }
      updatePayload.price = parsedPrice.toFixed(2)
    }
    if (body.description !== undefined) {
      updatePayload.description = String(body.description ?? '').trim() || null
    }
    if (body.available !== undefined) {
      updatePayload.available = Boolean(body.available)
    }

    const [updated] = await db
      .update(products)
      .set(updatePayload)
      .where(and(eq(products.id, id), eq(products.businessId, business.id)))
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
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const [deleted] = await db
      .delete(products)
      .where(and(eq(products.id, id), eq(products.businessId, business.id)))
      .returning()
    if (!deleted) return c.json({ error: 'Product not found' }, 404)
    return c.json({ success: true, deleted })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

// Customers (Isolated by business.id)
app.get('/api/customers', async (c) => {
  try {
    const user = await getAuthenticatedUser(c)
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const items = await db
      .select()
      .from(customers)
      .where(eq(customers.businessId, business.id))
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
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const [newCustomer] = await db
      .insert(customers)
      .values({
        businessId: business.id,
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
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

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
      .where(and(eq(customers.id, id), eq(customers.businessId, business.id)))
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
    if (!user) return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const db = getDb(c.env?.DATABASE_URL)
    const business = await resolveActiveBusinessForUser(db, user, getRequestedBusinessId(c))

    const [deleted] = await db
      .delete(customers)
      .where(and(eq(customers.id, id), eq(customers.businessId, business.id)))
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
