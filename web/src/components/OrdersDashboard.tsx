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

const COFFEE_OPTIONS = [
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

export function OrdersDashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [showModal, setShowModal] = useState<boolean>(false)
  const [submitting, setSubmitting] = useState<boolean>(false)

  // Form state
  const [customerName, setCustomerName] = useState('')
  const [coffeeType, setCoffeeType] = useState('Espresso')
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/orders')
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status}: ${res.statusText}`)
      }
      const data: Order[] = await res.json()
      setOrders(data)
    } catch (err) {
      console.error('Error fetching orders:', err)
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
    fetchOrders()
  }, [fetchOrders])

  const handleUpdateStatus = async (id: string, newStatus: string) => {
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

  const handleDelete = async (id: string) => {
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
      setShowModal(false)
      setCustomerName('')
      setNotes('')
      setQuantity(1)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al crear la orden')
    } finally {
      setSubmitting(false)
    }
  }

  // Filtered orders
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

  // Stats
  const stats = useMemo(() => {
    const total = orders.length
    const pending = orders.filter((o) => o.status === 'pending').length
    const completed = orders.filter((o) => o.status === 'completed').length
    const cancelled = orders.filter((o) => o.status === 'cancelled').length
    const totalCups = orders.reduce((sum, o) => sum + (o.quantity || 1), 0)
    return { total, pending, completed, cancelled, totalCups }
  }, [orders])

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
            <span className="coffee-icon">☕</span> Barista Orders Dashboard
          </h1>
          <p className="orders-subtitle">
            Monitoreo en tiempo real sincronizado con PostgreSQL & Drizzle ORM
          </p>
        </div>
        <div className="orders-header-actions">
          <button
            type="button"
            className="btn-refresh"
            onClick={fetchOrders}
            disabled={loading}
            title="Refrescar órdenes"
          >
            <span className={loading ? 'spinning' : ''}>🔄</span> Refrescar
          </button>
          <button
            type="button"
            className="btn-new-order"
            onClick={() => setShowModal(true)}
          >
            <span>+</span> Nueva Orden
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="orders-stats">
        <div className="stat-card">
          <span className="stat-label">Total Órdenes</span>
          <span className="stat-value">{stats.total}</span>
        </div>
        <div className="stat-card stat-pending">
          <span className="stat-label">Pendientes</span>
          <span className="stat-value">{stats.pending}</span>
        </div>
        <div className="stat-card stat-completed">
          <span className="stat-label">Completadas</span>
          <span className="stat-value">{stats.completed}</span>
        </div>
        <div className="stat-card stat-cups">
          <span className="stat-label">Tazas Servidas</span>
          <span className="stat-value">{stats.totalCups}</span>
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
          <button type="button" className="btn-retry" onClick={fetchOrders}>
            Reintentar
          </button>
        </div>
      )}

      {/* Controls: Search and Status Filters */}
      <div className="orders-controls">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Buscar por cliente, café o nota..."
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

        <div className="filter-tabs">
          <button
            type="button"
            className={`filter-tab ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            Todas ({stats.total})
          </button>
          <button
            type="button"
            className={`filter-tab tab-pending ${statusFilter === 'pending' ? 'active' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            Pendientes ({stats.pending})
          </button>
          <button
            type="button"
            className={`filter-tab tab-completed ${statusFilter === 'completed' ? 'active' : ''}`}
            onClick={() => setStatusFilter('completed')}
          >
            Completadas ({stats.completed})
          </button>
          <button
            type="button"
            className={`filter-tab tab-cancelled ${statusFilter === 'cancelled' ? 'active' : ''}`}
            onClick={() => setStatusFilter('cancelled')}
          >
            Canceladas ({stats.cancelled})
          </button>
        </div>
      </div>

      {/* Orders Table */}
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
                onClick={() => setShowModal(true)}
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
                        onClick={() => handleUpdateStatus(order.id, 'completed')}
                        title="Marcar como completada"
                      >
                        ✓ Listo
                      </button>
                    )}
                    {order.status === 'pending' && (
                      <button
                        type="button"
                        className="btn-action btn-cancel"
                        onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                        title="Cancelar orden"
                      >
                        ✕
                      </button>
                    )}
                    {order.status !== 'pending' && (
                      <button
                        type="button"
                        className="btn-action btn-reopen"
                        onClick={() => handleUpdateStatus(order.id, 'pending')}
                        title="Reabrir como pendiente"
                      >
                        ↩ Reabrir
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-action btn-delete"
                      onClick={() => handleDelete(order.id)}
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

      {/* Modal Nueva Orden */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>☕ Nueva Orden de Café</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowModal(false)}
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
                  required
                  placeholder="Ej. Juan Pérez"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="coffee-type">Tipo de Café *</label>
                  <select
                    id="coffee-type"
                    value={coffeeType}
                    onChange={(e) => setCoffeeType(e.target.value)}
                  >
                    {COFFEE_OPTIONS.map((c) => (
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
                  onClick={() => setShowModal(false)}
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
    </div>
  )
}
