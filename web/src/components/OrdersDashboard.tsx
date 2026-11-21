/** @jsxImportSource react */
import React, { useState, useEffect, useCallback, useMemo } from 'react'

export interface Order {
  id: string
  customerName: string
  coffeeType: string
  quantity: number
  status: 'pending' | 'completed' | 'cancelled' | string
  notes?: string | null
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

type DashboardSection = 'orders' | 'products' | 'customers'

const DEFAULT_COFFEE_OPTIONS = [
  'Espresso',
  'Espresso Doble',
  'Americano',
  'Cappuccino',
  'Flat White',
  'Latte',
  'Cold Brew',
  'Mocha',
  'Caramel Macchiato',
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

  // Order Form state
  const [customerName, setCustomerName] = useState('')
  const [coffeeType, setCoffeeType] = useState('Espresso')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

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

  // Available coffee options from DB products or default fallback
  const coffeeOptions = useMemo(() => {
    const activeProds = productsList.filter((p) => p.available).map((p) => p.name)
    return activeProds.length > 0 ? activeProds : DEFAULT_COFFEE_OPTIONS
  }, [productsList])

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
    if (!customerName.trim()) return

    try {
      setSubmitting(true)
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          coffeeType,
          quantity: Number(quantity) || 1,
          notes: notes.trim() || undefined,
          status: 'pending',
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
      setNotes('')
      setQuantity(1)
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
      const matchesSearch =
        !query ||
        order.customerName.toLowerCase().includes(query) ||
        order.coffeeType.toLowerCase().includes(query) ||
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
    const totalCups = orders.reduce((sum, o) => sum + (o.quantity || 1), 0)

    const totalProducts = productsList.length
    const availableProducts = productsList.filter((p) => p.available).length

    const totalCustomers = customersList.length
    const totalPoints = customersList.reduce((sum, c) => sum + (c.loyaltyPoints || 0), 0)

    return {
      totalOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      totalCups,
      totalProducts,
      availableProducts,
      totalCustomers,
      totalPoints,
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
            Gestión de Órdenes, Productos y Clientes con PostgreSQL & Drizzle ORM
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
              onClick={() => {
                if (coffeeOptions.length > 0) setCoffeeType(coffeeOptions[0])
                setShowOrderModal(true)
              }}
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
                if (coffeeOptions.length > 0) setCustFavoriteDrink(coffeeOptions[0])
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
          <span className="stat-label">Tazas Servidas</span>
          <span className="stat-value">{stats.totalCups}</span>
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
                ? 'Buscar orden por cliente, café o nota...'
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
                  onClick={() => setShowOrderModal(true)}
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
                  <th>Café</th>
                  <th className="text-center">Cant.</th>
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
                      <span className="coffee-badge">{order.coffeeType}</span>
                    </td>
                    <td className="text-center font-bold">{order.quantity}</td>
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
                        onClick={() => {
                          setCustomerName(customer.name)
                          if (customer.favoriteDrink) {
                            setCoffeeType(customer.favoriteDrink)
                          }
                          setShowOrderModal(true)
                        }}
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

      {/* ================= MODAL: NUEVA ORDEN ================= */}
      {showOrderModal && (
        <div className="modal-overlay" onClick={() => setShowOrderModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>☕ Nueva Orden de Café</h2>
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
                <label htmlFor="customer-name">Nombre del Cliente *</label>
                <input
                  id="customer-name"
                  type="text"
                  list="customers-datalist"
                  required
                  placeholder="Ej. Juan Pérez"
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

              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="coffee-type">Producto / Café *</label>
                  <select
                    id="coffee-type"
                    value={coffeeType}
                    onChange={(e) => setCoffeeType(e.target.value)}
                  >
                    {coffeeOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group w-24">
                  <label htmlFor="quantity">Cantidad</label>
                  <input
                    id="quantity"
                    type="number"
                    min="1"
                    max="20"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notas / Personalización</label>
                <input
                  id="notes"
                  type="text"
                  placeholder="Ej. Con leche de avena, sin azúcar, descafeinado"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                  disabled={submitting || !customerName.trim()}
                >
                  {submitting ? 'Guardando...' : 'Crear Orden'}
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
                    {coffeeOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
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
