import { Hono } from 'hono'
import { eq, desc } from 'drizzle-orm'
import { renderer } from './renderer'
import { Dashboard } from './components/Dashboard'
import { getGcpAccessToken } from './gcp-auth'
import { getDb, coffeeOrders } from './db'

type Bindings = {
  AGENT_RUNTIME_API_URL?: string
  GCP_SA_KEY_JSON?: string
  DATABASE_URL?: string
}

const app = new Hono<{ Bindings: Bindings }>()

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

// Database endpoints using Drizzle ORM
app.get('/api/orders', async (c) => {
  try {
    const db = getDb(c.env?.DATABASE_URL)
    const orders = await db.select().from(coffeeOrders).orderBy(desc(coffeeOrders.createdAt))
    return c.json(orders)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.post('/api/orders', async (c) => {
  try {
    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    const [newOrder] = await db.insert(coffeeOrders).values({
      customerName: body.customerName,
      coffeeType: body.coffeeType,
      quantity: body.quantity ?? 1,
      notes: body.notes,
      status: body.status ?? 'pending',
    }).returning()
    return c.json(newOrder, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 400)
  }
})

app.get('/api/orders/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const db = getDb(c.env?.DATABASE_URL)
    const [order] = await db.select().from(coffeeOrders).where(eq(coffeeOrders.id, id))
    if (!order) return c.json({ error: 'Order not found' }, 404)
    return c.json(order)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.patch('/api/orders/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const db = getDb(c.env?.DATABASE_URL)
    const [updated] = await db
      .update(coffeeOrders)
      .set({
        ...(body.status ? { status: body.status } : {}),
        ...(body.coffeeType ? { coffeeType: body.coffeeType } : {}),
        ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(coffeeOrders.id, id))
      .returning()
    if (!updated) return c.json({ error: 'Order not found' }, 404)
    return c.json(updated)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500)
  }
})

app.delete('/api/orders/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const db = getDb(c.env?.DATABASE_URL)
    const [deleted] = await db
      .delete(coffeeOrders)
      .where(eq(coffeeOrders.id, id))
      .returning()
    if (!deleted) return c.json({ error: 'Order not found' }, 404)
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
