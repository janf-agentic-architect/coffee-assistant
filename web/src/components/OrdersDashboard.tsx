/** @jsxImportSource react */
import React, { useState, useEffect, useCallback, useMemo } from 'react'

export interface OrderItem {
  id?: string
  orderId?: string
  productId?: string | null
  productName: string
  quantity: number
  unitPrice: string
  notes?: string | null
}

export interface Order {
  id: string
  customerId?: string | null
  customerName: string
  status: 'pending' | 'completed' | 'cancelled' | string
  totalAmount: string
  notes?: string | null
  items: OrderItem[]
  createdAt: string
  updatedAt: string
}

export interface Product {
  id: string
  name: string
  category: string
  price: string
  description?: string | null
  available: boolean
  createdAt: string
  updatedAt: string
}

export interface Customer {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  favoriteDrink?: string | null
  loyaltyPoints: number
  createdAt: string
  updatedAt: string
}

interface DraftOrderItem {
  productId?: string | null
  productName: string
  quantity: number
  unitPrice: string
  notes: string
}

type DashboardSection = 'orders' | 'products' | 'customers'

const DEFAULT_COFFEE_OPTIONS: Array<{ name: string; price: string }> = [
  { name: 'Espresso', price: '3.00' },
  { name: 'Espresso Doble', price: '3.75' },
  { name: 'Flat White', price: '4.50' },
  { name: 'Cappuccino Vainilla', price: '4.75' },
  { name: 'Latte Caramelo', price: '5.00' },
  { name: 'Cold Brew', price: '4.50' },
  { name: 'Matcha Latte', price: '5.25' },
  { name: 'Croissant de Almendras', price: '3.80' },
]

const PRODUCT_CATEGORIES = [
  'Café Caliente',
  'Café Frío',
  'Especialidades',
  'Sin Café',
  'Panadería',
]

export function OrdersDashboard() {
  const [activeSection, setActiveSection] = useState<DashboardSection>('orders')

  // Data state
  const [orders, setOrders] = useState<Order[]>([])
  const [productsList, setProductsList] = useState<Product[]>([])
  const [customersList, setCustomersList] = useState<Customer[]>([])

  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Section-specific filters
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Modals state
  const [showOrderModal, setShowOrderModal] = useState<boolean>(false)
  const [showProductModal, setShowProductModal] = useState<boolean>(false)
  const [showCustomerModal, setShowCustomerModal] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)

  // Order Form state (Multi-product cart)
  const [customerName, setCustomerName] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [draftItems, setDraftItems] = useState<DraftOrderItem[]>([
    { productName: 'Espresso', quantity: 1, unitPrice: '3.00', notes: '' },
  ])

  // Product Form state
  const [prodName, setProdName] = useState('')
  const [prodCategory, setProdCategory] = useState('Café Caliente')
  const [prodPrice, setProdPrice] = useState('4.00')
  const [prodDescription, setProdDescription] = useState('')
  const [prodAvailable, setProdAvailable] = useState(true)

  // Customer Form state
  const [custName, setCustName] = useState('')
  const [custEmail, setCustEmail] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [custFavoriteDrink, setCustFavoriteDrink] = useState('Espresso')
  const [custPoints, setCustPoints] = useState(0)

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const [ordersRes, productsRes, customersRes] = await Promise.all([
        fetch('/api/orders'),
        fetch('/api/products'),
        fetch('/api/customers'),
      ])

      if (!ordersRes.ok) {
        const errData = await ordersRes.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${ordersRes.status}: ${ordersRes.statusText}`)
      }
      if (!productsRes.ok) {
        const errData = await productsRes.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${productsRes.status}: ${productsRes.statusText}`)
      }
      if (!customersRes.ok) {
        const errData = await customersRes.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${customersRes.status}: ${customersRes.statusText}`)
      }

      const [ordersData, productsData, customersData] = await Promise.all([
        ordersRes.json() as Promise<Order[]>,
        productsRes.json() as Promise<Product[]>,
        customersRes.json() as Promise<Customer[]>,
      ])

      setOrders(ordersData)
      setProductsList(productsData)
      setCustomersList(customersData)
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo conectar a la base de datos PostgreSQL. Asegúrate de ejecutar `make dev-db`.'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  // Catalog of selectable products with price & id
  const selectableCatalog = useMemo(() => {
    const activeProds = productsList.filter((p) => p.available)
    if (activeProds.length > 0) {
      return activeProds.map((p) => ({
        id: p.id,
        name: p.name,
        price: Number(p.price).toFixed(2),
      }))
    }
    return DEFAULT_COFFEE_OPTIONS.map((d) => ({ id: null, name: d.name, price: d.price }))
  }, [productsList])

  const openNewOrderModal = (prefillCustomer?: Customer) => {
    const defaultProduct =
      (prefillCustomer?.favoriteDrink &&
        selectableCatalog.find((p) => p.name === prefillCustomer.favoriteDrink)) ||
      selectableCatalog[0] || { id: null, name: 'Espresso', price: '3.00' }

    setCustomerName(prefillCustomer ? prefillCustomer.name : '')
    setOrderNotes('')
    setDraftItems([
      {
        productId: defaultProduct.id,
        productName: defaultProduct.name,
        quantity: 1,
        unitPrice: defaultProduct.price,
        notes: '',
      },
    ])
    setShowOrderModal(true)
  }

  const handleAddDraftItem = () => {
    const first = selectableCatalog[0] || { id: null, name: 'Espresso', price: '3.00' }
    setDraftItems((prev) => [
      ...prev,
      {
        productId: first.id,
        productName: first.name,
        quantity: 1,
        unitPrice: first.price,
        notes: '',
      },
    ])
  }

  const handleRemoveDraftItem = (index: number) => {
    setDraftItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  const handleDraftProductChange = (index: number, newProductName: string) => {
    const found = selectableCatalog.find((p) => p.name === newProductName)
    setDraftItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              productId: found?.id ?? null,
              productName: newProductName,
              unitPrice: found ? found.price : item.unitPrice,
            }
          : item
      )
    )
  }

  const handleDraftQuantityChange = (index: number, qty: number) => {
    setDraftItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: Math.max(1, qty || 1) } : item))
    )
  }

  const handleDraftNotesChange = (index: number, noteText: string) => {
    setDraftItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, notes: noteText } : item))
    )
  }

  const draftTotalAmount = useMemo(() => {
    return draftItems.reduce((sum, item) => {
      return sum + (Number(item.unitPrice) || 0) * (Number(item.quantity) || 1)
    }, 0)
  }, [draftItems])

  // ================= ORDERS ACTIONS =================
  const handleUpdateOrderStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} al actualizar la orden`)
      }
      const updated: Order = await res.json()
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al actualizar orden')
    }
  }

  const handleDeleteOrder = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta orden?')) return
    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} al eliminar la orden`)
      }
      setOrders((prev) => prev.filter((o) => o.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar orden')
    }
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerName.trim() || draftItems.length === 0) return

    const matchedCustomer = customersList.find(
      (c) => c.name.toLowerCase() === customerName.trim().toLowerCase()
    )

    try {
      setSubmitting(true)
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: matchedCustomer?.id || null,
          customerName: customerName.trim(),
          totalAmount: draftTotalAmount.toFixed(2),
          notes: orderNotes.trim() || undefined,
          status: 'pending',
          items: draftItems.map((item) => ({
            productId: item.productId || null,
            productName: item.productName,
            quantity: Number(item.quantity) || 1,
            unitPrice: item.unitPrice,
            notes: item.notes.trim() || null,
          })),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} al crear la orden`)
      }
      const created: Order = await res.json()
      setOrders((prev) => [created, ...prev])
      setShowOrderModal(false)
      setCustomerName('')
      setOrderNotes('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al crear la orden')
    } finally {
      setSubmitting(false)
    }
  }

  // ================= PRODUCTS ACTIONS =================
  const handleToggleProductAvailability = async (product: Product) => {
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ available: !product.available }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} al actualizar producto`)
      }
      const updated: Product = await res.json()
      setProductsList((prev) => prev.map((p) => (p.id === product.id ? updated : p)))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al actualizar producto')
    }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este producto del menú?')) return
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} al eliminar producto`)
      }
      setProductsList((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar producto')
    }
  }

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prodName.trim()) return

    try {
      setSubmitting(true)
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: prodName.trim(),
          category: prodCategory,
          price: Number(prodPrice).toFixed(2),
          description: prodDescription.trim() || undefined,
          available: prodAvailable,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} al crear producto`)
      }
      const created: Product = await res.json()
      setProductsList((prev) => [...prev, created])
      setShowProductModal(false)
      setProdName('')
      setProdDescription('')
      setProdPrice('4.00')
      setProdAvailable(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al crear producto')
    } finally {
      setSubmitting(false)
    }
  }

  // ================= CUSTOMERS ACTIONS =================
  const handleAddCustomerPoints = async (customer: Customer, delta: number) => {
    const nextPoints = Math.max(0, (customer.loyaltyPoints || 0) + delta)
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loyaltyPoints: nextPoints }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} al actualizar puntos`)
      }
      const updated: Customer = await res.json()
      setCustomersList((prev) => prev.map((c) => (c.id === customer.id ? updated : c)))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al actualizar puntos')
    }
  }

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este cliente?')) return
    try {
      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} al eliminar cliente`)
      }
      setCustomersList((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar cliente')
    }
  }

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!custName.trim()) return

    try {
      setSubmitting(true)
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: custName.trim(),
          email: custEmail.trim() || undefined,
          phone: custPhone.trim() || undefined,
          favoriteDrink: custFavoriteDrink.trim() || undefined,
          loyaltyPoints: Number(custPoints) || 0,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} al registrar cliente`)
      }
      const created: Customer = await res.json()
      setCustomersList((prev) => [created, ...prev])
      setShowCustomerModal(false)
      setCustName('')
      setCustEmail('')
      setCustPhone('')
      setCustPoints(0)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al registrar cliente')
    } finally {
      setSubmitting(false)
    }
  }

  // ================= FILTERED LISTS & STATS =================
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter
      const query = searchQuery.toLowerCase().trim()
      const matchesItems =
        order.items &&
        order.items.some(
          (item) =>
            item.productName.toLowerCase().includes(query) ||
            (item.notes && item.notes.toLowerCase().includes(query))
        )
      const matchesSearch =
        !query ||
        order.customerName.toLowerCase().includes(query) ||
        matchesItems ||
        (order.notes && order.notes.toLowerCase().includes(query))
      return matchesStatus && matchesSearch
    })
  }, [orders, statusFilter, searchQuery])

  const filteredProducts = useMemo(() => {
    return productsList.filter((product) => {
      const matchesCategory = categoryFilter === 'all' || product.category === categoryFilter
      const query = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query) ||
        (product.description && product.description.toLowerCase().includes(query))
      return matchesCategory && matchesSearch
    })
  }, [productsList, categoryFilter, searchQuery])

  const filteredCustomers = useMemo(() => {
    return customersList.filter((customer) => {
      const query = searchQuery.toLowerCase().trim()
      return (
        !query ||
        customer.name.toLowerCase().includes(query) ||
        (customer.email && customer.email.toLowerCase().includes(query)) ||
        (customer.phone && customer.phone.toLowerCase().includes(query)) ||
        (customer.favoriteDrink && customer.favoriteDrink.toLowerCase().includes(query))
      )
    })
  }, [customersList, searchQuery])

  const stats = useMemo(() => {
    const totalOrders = orders.length
    const pendingOrders = orders.filter((o) => o.status === 'pending').length
    const completedOrders = orders.filter((o) => o.status === 'completed').length
    const cancelledOrders = orders.filter((o) => o.status === 'cancelled').length
    const totalItemsCount = orders.reduce(
      (sum, o) =>
        sum + (o.items ? o.items.reduce((acc, it) => acc + (it.quantity || 1), 0) : 0),
      0
    )
    const totalRevenue = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0)

    const totalProducts = productsList.length
    const availableProducts = productsList.filter((p) => p.available).length

    const totalCustomers = customersList.length

    return {
      totalOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      totalItemsCount,
      totalRevenue,
      totalProducts,
      availableProducts,
      totalCustomers,
    }
  }, [orders, productsList, customersList])

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return isoString
    }
  }

  return (
    <div className="orders-dashboard">
      {/* Header */}
      <div className="orders-header">
        <div>
          <h1 className="orders-title">
            <span className="coffee-icon">☕</span> Coffee Shop Dashboard
          </h1>
          <p className="orders-subtitle">
            Órdenes Multi-Producto, Catálogo y Clientes con PostgreSQL & Drizzle ORM
          </p>
        </div>
        <div className="orders-header-actions">
          <button
            type="button"
            className="btn-refresh"
            onClick={fetchAllData}
            disabled={loading}
            title="Refrescar datos"
          >
            <span className={loading ? 'spinning' : ''}>🔄</span> Refrescar
          </button>
          {activeSection === 'orders' && (
            <button
              type="button"
              className="btn-new-order"
              onClick={() => openNewOrderModal()}
            >
              <span>+</span> Nueva Orden
            </button>
          )}
          {activeSection === 'products' && (
            <button
              type="button"
              className="btn-new-order"
              onClick={() => setShowProductModal(true)}
            >
              <span>+</span> Nuevo Producto
            </button>
          )}
          {activeSection === 'customers' && (
            <button
              type="button"
              className="btn-new-order"
              onClick={() => {
                if (selectableCatalog.length > 0) setCustFavoriteDrink(selectableCatalog[0].name)
                setShowCustomerModal(true)
              }}
            >
              <span>+</span> Nuevo Cliente
            </button>
          )}
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="dashboard-nav-tabs">
        <button
          type="button"
          className={`nav-tab-btn ${activeSection === 'orders' ? 'active' : ''}`}
          onClick={() => {
            setActiveSection('orders')
            setSearchQuery('')
          }}
        >
          📋 Órdenes <span className="nav-badge">{stats.totalOrders}</span>
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeSection === 'products' ? 'active' : ''}`}
          onClick={() => {
            setActiveSection('products')
            setSearchQuery('')
          }}
        >
          🥐 Productos <span className="nav-badge">{stats.totalProducts}</span>
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeSection === 'customers' ? 'active' : ''}`}
          onClick={() => {
            setActiveSection('customers')
            setSearchQuery('')
          }}
        >
          👥 Clientes <span className="nav-badge">{stats.totalCustomers}</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="orders-stats">
        <div className="stat-card">
          <span className="stat-label">Órdenes / Pendientes</span>
          <span className="stat-value">
            {stats.totalOrders}{' '}
            <small className="stat-subvalue">({stats.pendingOrders} pend.)</small>
          </span>
        </div>
        <div className="stat-card stat-completed">
          <span className="stat-label">Ventas / Ítems</span>
          <span className="stat-value">
            ${stats.totalRevenue.toFixed(2)}{' '}
            <small className="stat-subvalue-neutral">({stats.totalItemsCount} ítems)</small>
          </span>
        </div>
        <div className="stat-card stat-pending">
          <span className="stat-label">Productos Activos</span>
          <span className="stat-value">
            {stats.availableProducts} / {stats.totalProducts}
          </span>
        </div>
        <div className="stat-card stat-cups">
          <span className="stat-label">Clientes Registrados</span>
          <span className="stat-value">{stats.totalCustomers}</span>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="orders-error-banner">
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <strong>Error de conexión con la base de datos</strong>
            <p>{error}</p>
            <div className="error-tip">
              Tip: ¿El contenedor de Postgres está activo? Inícialo con: <code>make dev-db</code>
            </div>
          </div>
          <button type="button" className="btn-retry" onClick={fetchAllData}>
            Reintentar
          </button>
        </div>
      )}

      {/* Controls: Search and Contextual Filters */}
      <div className="orders-controls">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder={
              activeSection === 'orders'
                ? 'Buscar orden por cliente, producto o nota...'
                : activeSection === 'products'
                ? 'Buscar producto por nombre, categoría o descripción...'
                : 'Buscar cliente por nombre, email, teléfono o bebida...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearchQuery('')}
            >
              ×
            </button>
          )}
        </div>

        {activeSection === 'orders' && (
          <div className="filter-tabs">
            <button
              type="button"
              className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Todas ({stats.totalOrders})
            </button>
            <button
              type="button"
              className={`filter-tab tab-pending ${statusFilter === 'pending' ? 'active' : ''}`}
              onClick={() => setStatusFilter('pending')}
            >
              Pendientes ({stats.pendingOrders})
            </button>
            <button
              type="button"
              className={`filter-tab tab-completed ${statusFilter === 'completed' ? 'active' : ''}`}
              onClick={() => setStatusFilter('completed')}
            >
              Completadas ({stats.completedOrders})
            </button>
            <button
              type="button"
              className={`filter-tab tab-cancelled ${statusFilter === 'cancelled' ? 'active' : ''}`}
              onClick={() => setStatusFilter('cancelled')}
            >
              Canceladas ({stats.cancelledOrders})
            </button>
          </div>
        )}

        {activeSection === 'products' && (
          <div className="filter-tabs">
            <button
              type="button"
              className={`filter-tab ${categoryFilter === 'all' ? 'active' : ''}`}
              onClick={() => setCategoryFilter('all')}
            >
              Todos ({stats.totalProducts})
            </button>
            {PRODUCT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`filter-tab ${categoryFilter === cat ? 'active' : ''}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ================= SECTION: ORDERS TABLE ================= */}
      {activeSection === 'orders' && (
        <div className="orders-table-container">
          {loading && orders.length === 0 ? (
            <div className="orders-loading">
              <span className="spinning">⏳</span> Cargando órdenes...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="orders-empty">
              <p>☕ No se encontraron órdenes con los filtros actuales.</p>
              {statusFilter !== 'all' || searchQuery ? (
                <button
                  type="button"
                  className="btn-reset-filters"
                  onClick={() => {
                    setStatusFilter('all')
                    setSearchQuery('')
                  }}
                >
                  Limpiar filtros
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-new-order"
                  onClick={() => openNewOrderModal()}
                >
                  + Crear la primera orden
                </button>
              )}
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Productos ({'order_items'})</th>
                  <th className="text-right">Total</th>
                  <th>Estado</th>
                  <th>Hora</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} className={`order-row status-${order.status}`}>
                    <td className="customer-cell">
                      <div className="customer-avatar">
                        {order.customerName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="customer-name">{order.customerName}</div>
                        {order.notes && <div className="order-notes">📝 {order.notes}</div>}
                      </div>
                    </td>
                    <td>
                      <div className="order-items-list">
                        {order.items && order.items.length > 0 ? (
                          order.items.map((item, idx) => (
                            <div key={item.id || idx} className="order-item-chip">
                              <span className="order-item-qty">{item.quantity}x</span>
                              <span className="order-item-name">{item.productName}</span>
                              {item.notes && (
                                <span className="order-item-note">({item.notes})</span>
                              )}
                            </div>
                          ))
                        ) : (
                          <span className="order-notes">Sin productos</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right font-bold price-cell">
                      ${Number(order.totalAmount || 0).toFixed(2)}
                    </td>
                    <td>
                      <span className={`status-pill pill-${order.status}`}>
                        {order.status === 'pending' && '⏳ Pendiente'}
                        {order.status === 'completed' && '✅ Completado'}
                        {order.status === 'cancelled' && '❌ Cancelado'}
                        {!['pending', 'completed', 'cancelled'].includes(order.status) &&
                          order.status}
                      </span>
                    </td>
                    <td className="order-time">{formatDate(order.createdAt)}</td>
                    <td className="actions-cell">
                      {order.status === 'pending' && (
                        <button
                          type="button"
                          className="btn-action btn-complete"
                          onClick={() => handleUpdateOrderStatus(order.id, 'completed')}
                          title="Marcar como completada"
                        >
                          ✓ Listo
                        </button>
                      )}
                      {order.status === 'pending' && (
                        <button
                          type="button"
                          className="btn-action btn-cancel"
                          onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                          title="Cancelar orden"
                        >
                          ✕
                        </button>
                      )}
                      {order.status !== 'pending' && (
                        <button
                          type="button"
                          className="btn-action btn-reopen"
                          onClick={() => handleUpdateOrderStatus(order.id, 'pending')}
                          title="Reabrir como pendiente"
                        >
                          ↩ Reabrir
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-action btn-delete"
                        onClick={() => handleDeleteOrder(order.id)}
                        title="Eliminar orden"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ================= SECTION: PRODUCTS TABLE ================= */}
      {activeSection === 'products' && (
        <div className="orders-table-container">
          {loading && productsList.length === 0 ? (
            <div className="orders-loading">
              <span className="spinning">⏳</span> Cargando productos...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="orders-empty">
              <p>🥐 No se encontraron productos en el catálogo.</p>
              {categoryFilter !== 'all' || searchQuery ? (
                <button
                  type="button"
                  className="btn-reset-filters"
                  onClick={() => {
                    setCategoryFilter('all')
                    setSearchQuery('')
                  }}
                >
                  Limpiar filtros
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-new-order"
                  onClick={() => setShowProductModal(true)}
                >
                  + Agregar primer producto
                </button>
              )}
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Precio</th>
                  <th>Disponibilidad</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="order-row">
                    <td className="customer-cell">
                      <div className="customer-avatar product-avatar">☕</div>
                      <div>
                        <div className="customer-name">{product.name}</div>
                        {product.description && (
                          <div className="order-notes">{product.description}</div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="category-badge">{product.category}</span>
                    </td>
                    <td className="font-bold price-cell">${Number(product.price).toFixed(2)}</td>
                    <td>
                      <span
                        className={`status-pill ${
                          product.available ? 'pill-completed' : 'pill-cancelled'
                        }`}
                      >
                        {product.available ? '✅ Disponible' : '🚫 Agotado'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className={`btn-action ${
                          product.available ? 'btn-reopen' : 'btn-complete'
                        }`}
                        onClick={() => handleToggleProductAvailability(product)}
                        title="Cambiar disponibilidad"
                      >
                        {product.available ? 'Marcar Agotado' : 'Activar'}
                      </button>
                      <button
                        type="button"
                        className="btn-action btn-delete"
                        onClick={() => handleDeleteProduct(product.id)}
                        title="Eliminar producto"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ================= SECTION: CUSTOMERS TABLE ================= */}
      {activeSection === 'customers' && (
        <div className="orders-table-container">
          {loading && customersList.length === 0 ? (
            <div className="orders-loading">
              <span className="spinning">⏳</span> Cargando clientes...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="orders-empty">
              <p>👥 No se encontraron clientes registrados.</p>
              {searchQuery ? (
                <button
                  type="button"
                  className="btn-reset-filters"
                  onClick={() => setSearchQuery('')}
                >
                  Limpiar búsqueda
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-new-order"
                  onClick={() => setShowCustomerModal(true)}
                >
                  + Registrar primer cliente
                </button>
              )}
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contacto</th>
                  <th>Bebida Favorita</th>
                  <th className="text-center">Puntos Lealtad</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="order-row">
                    <td className="customer-cell">
                      <div className="customer-avatar">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="customer-name">{customer.name}</div>
                      </div>
                    </td>
                    <td>
                      <div className="contact-info">
                        {customer.email && <div>✉️ {customer.email}</div>}
                        {customer.phone && <div className="order-notes">📱 {customer.phone}</div>}
                        {!customer.email && !customer.phone && (
                          <span className="order-notes">Sin datos</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {customer.favoriteDrink ? (
                        <span className="coffee-badge">{customer.favoriteDrink}</span>
                      ) : (
                        <span className="order-notes">—</span>
                      )}
                    </td>
                    <td className="text-center">
                      <span className="loyalty-badge">⭐ {customer.loyaltyPoints} pts</span>
                    </td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="btn-action btn-complete"
                        onClick={() => handleAddCustomerPoints(customer, 10)}
                        title="Sumar 10 puntos"
                      >
                        +10 pts
                      </button>
                      <button
                        type="button"
                        className="btn-action btn-reopen"
                        onClick={() => openNewOrderModal(customer)}
                        title="Crear orden para este cliente"
                      >
                        ☕ Ordenar
                      </button>
                      <button
                        type="button"
                        className="btn-action btn-delete"
                        onClick={() => handleDeleteCustomer(customer.id)}
                        title="Eliminar cliente"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ================= MODAL: NUEVA ORDEN MULTI-PRODUCTO ================= */}
      {showOrderModal && (
        <div className="modal-overlay" onClick={() => setShowOrderModal(false)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>☕ Nueva Orden (Múltiples Productos)</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowOrderModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateOrder} className="modal-form">
              <div className="form-group">
                <label htmlFor="customer-name">Cliente *</label>
                <input
                  id="customer-name"
                  type="text"
                  list="customers-datalist"
                  required
                  placeholder="Selecciona o escribe el nombre del cliente"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  autoFocus
                />
                <datalist id="customers-datalist">
                  {customersList.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>

              <div className="order-cart-section">
                <div className="order-cart-header">
                  <label>Productos de la Orden ({draftItems.length})</label>
                  <button
                    type="button"
                    className="btn-add-item"
                    onClick={handleAddDraftItem}
                  >
                    + Agregar otro producto
                  </button>
                </div>

                <div className="order-cart-rows">
                  {draftItems.map((item, index) => (
                    <div key={index} className="order-cart-row">
                      <div className="order-cart-row-main">
                        <select
                          className="flex-1"
                          value={item.productName}
                          onChange={(e) => handleDraftProductChange(index, e.target.value)}
                        >
                          {selectableCatalog.map((c) => (
                            <option key={c.name} value={c.name}>
                              {c.name} (${c.price})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          className="w-20"
                          min="1"
                          max="25"
                          value={item.quantity}
                          onChange={(e) =>
                            handleDraftQuantityChange(index, Number(e.target.value))
                          }
                          title="Cantidad"
                        />
                        <span className="cart-row-subtotal">
                          ${((Number(item.unitPrice) || 0) * item.quantity).toFixed(2)}
                        </span>
                        {draftItems.length > 1 && (
                          <button
                            type="button"
                            className="btn-remove-item"
                            onClick={() => handleRemoveDraftItem(index)}
                            title="Quitar este producto"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        className="cart-row-notes"
                        placeholder="Nota para este producto (ej. Leche de avena, sin azúcar)..."
                        value={item.notes}
                        onChange={(e) => handleDraftNotesChange(index, e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                <div className="order-cart-total">
                  <span>Total de la Orden:</span>
                  <strong>${draftTotalAmount.toFixed(2)}</strong>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="order-notes">Notas generales del pedido (opcional)</label>
                <input
                  id="order-notes"
                  type="text"
                  placeholder="Ej. Para llevar, entregar en mesa 4"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowOrderModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || !customerName.trim() || draftItems.length === 0}
                >
                  {submitting
                    ? 'Guardando...'
                    : `Crear Orden ($${draftTotalAmount.toFixed(2)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: NUEVO PRODUCTO ================= */}
      {showProductModal && (
        <div className="modal-overlay" onClick={() => setShowProductModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>🥐 Nuevo Producto</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowProductModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateProduct} className="modal-form">
              <div className="form-group">
                <label htmlFor="prod-name">Nombre del Producto *</label>
                <input
                  id="prod-name"
                  type="text"
                  required
                  placeholder="Ej. Caramel Macchiato"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="prod-category">Categoría *</label>
                  <select
                    id="prod-category"
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                  >
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group w-28">
                  <label htmlFor="prod-price">Precio (USD) *</label>
                  <input
                    id="prod-price"
                    type="number"
                    step="0.05"
                    min="0"
                    required
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="prod-desc">Descripción</label>
                <input
                  id="prod-desc"
                  type="text"
                  placeholder="Ej. Espresso con leche vaporizada y vainilla"
                  value={prodDescription}
                  onChange={(e) => setProdDescription(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={prodAvailable}
                    onChange={(e) => setProdAvailable(e.target.checked)}
                  />
                  <span>Disponible para ordenar inmediatamente</span>
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowProductModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || !prodName.trim()}
                >
                  {submitting ? 'Guardando...' : 'Guardar Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: NUEVO CLIENTE ================= */}
      {showCustomerModal && (
        <div className="modal-overlay" onClick={() => setShowCustomerModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>👥 Registrar Nuevo Cliente</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowCustomerModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateCustomer} className="modal-form">
              <div className="form-group">
                <label htmlFor="cust-name">Nombre Completo *</label>
                <input
                  id="cust-name"
                  type="text"
                  required
                  placeholder="Ej. Laura Martínez"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="cust-email">Correo Electrónico</label>
                  <input
                    id="cust-email"
                    type="email"
                    placeholder="laura@email.com"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                  />
                </div>
                <div className="form-group flex-1">
                  <label htmlFor="cust-phone">Teléfono</label>
                  <input
                    id="cust-phone"
                    type="text"
                    placeholder="+52 55 1234 5678"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="cust-drink">Bebida Favorita</label>
                  <select
                    id="cust-drink"
                    value={custFavoriteDrink}
                    onChange={(e) => setCustFavoriteDrink(e.target.value)}
                  >
                    {selectableCatalog.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group w-28">
                  <label htmlFor="cust-points">Puntos Iniciales</label>
                  <input
                    id="cust-points"
                    type="number"
                    min="0"
                    value={custPoints}
                    onChange={(e) => setCustPoints(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCustomerModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || !custName.trim()}
                >
                  {submitting ? 'Guardando...' : 'Registrar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
