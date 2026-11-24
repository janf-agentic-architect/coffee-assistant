/** @jsxImportSource react */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { authStore, useAuth, type BusinessProfile } from '../auth/auth-store'
import { guestStorage } from '../auth/guest-storage'
import { AuthModal } from './AuthModal'
import { BusinessModal } from './BusinessModal'

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
  { name: 'Double Espresso', price: '3.75' },
  { name: 'Flat White', price: '4.50' },
  { name: 'Vanilla Cappuccino', price: '4.75' },
  { name: 'Caramel Latte', price: '5.00' },
  { name: 'Cold Brew', price: '4.50' },
  { name: 'Matcha Latte', price: '5.25' },
  { name: 'Almond Croissant', price: '3.80' },
]

const PRODUCT_CATEGORIES = [
  'Hot Coffee',
  'Cold Coffee',
  'Specialties',
  'Coffee-Free',
  'Bakery',
]

export function OrdersDashboard() {
  const auth = useAuth()
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
  const [showBusinessModal, setShowBusinessModal] = useState<boolean>(false)
  const [businessModalMode, setBusinessModalMode] = useState<'create' | 'edit'>('create')
  const [submitting, setSubmitting] = useState<boolean>(false)

  // Order Form state (Multi-product cart)
  const [customerName, setCustomerName] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [draftItems, setDraftItems] = useState<DraftOrderItem[]>([
    { productName: 'Espresso', quantity: 1, unitPrice: '3.00', notes: '' },
  ])

  // Product Form state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [prodName, setProdName] = useState('')
  const [prodCategory, setProdCategory] = useState('Hot Coffee')
  const [prodPrice, setProdPrice] = useState('4.00')
  const [prodDescription, setProdDescription] = useState('')
  const [prodAvailable, setProdAvailable] = useState(true)

  // Customer Form state
  const [custName, setCustName] = useState('')
  const [custEmail, setCustEmail] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [custFavoriteDrink, setCustFavoriteDrink] = useState('Espresso')
  const [custPoints, setCustPoints] = useState(0)

  const activeBusiness = useMemo(
    () => auth.businesses.find((b) => b.id === auth.activeBusinessId) || auth.businesses[0] || null,
    [auth.businesses, auth.activeBusinessId]
  )

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (auth.idToken) {
      headers['Authorization'] = `Bearer ${auth.idToken}`
    }
    if (auth.activeBusinessId) {
      headers['X-Business-Id'] = auth.activeBusinessId
    }
    return headers
  }, [auth.idToken, auth.activeBusinessId])

  const fetchBusinesses = useCallback(async () => {
    if (auth.isGuest || !auth.idToken) return
    try {
      const res = await fetch('/api/businesses', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.idToken}`,
        },
      })
      if (!res.ok) return
      const list = (await res.json()) as BusinessProfile[]
      authStore.setBusinesses(list)
    } catch (err) {
      console.error('Error fetching businesses:', err)
    }
  }, [auth.isGuest, auth.idToken])

  useEffect(() => {
    fetchBusinesses()
  }, [fetchBusinesses])

  const fetchAllData = useCallback(async () => {
    if (auth.isGuest) {
      setLoading(true)
      setError(null)
      const guestData = guestStorage.getAll()
      setOrders(guestData.orders)
      setProductsList(guestData.products)
      setCustomersList(guestData.customers)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const headers = getAuthHeaders()
      const [ordersRes, productsRes, customersRes] = await Promise.all([
        fetch('/api/orders', { headers }),
        fetch('/api/products', { headers }),
        fetch('/api/customers', { headers }),
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
          : 'Could not connect to the PostgreSQL database. Make sure to run `make dev-db`.'
      )
    } finally {
      setLoading(false)
    }
  }, [auth.isGuest, getAuthHeaders])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  const handleResetGuestData = () => {
    if (!confirm('Reset the demo data for your guest session?')) return
    const fresh = guestStorage.resetDemoData()
    setOrders(fresh.orders)
    setProductsList(fresh.products)
    setCustomersList(fresh.customers)
  }

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
    if (auth.isGuest) {
      try {
        const updated = guestStorage.updateOrderStatus(id, newStatus)
        setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)))
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Error updating order')
      }
      return
    }

    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} updating order`)
      }
      const updated: Order = await res.json()
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error updating order')
    }
  }

  const handleDeleteOrder = async (id: string) => {
    if (!confirm('Are you sure you want to delete this order?')) return
    if (auth.isGuest) {
      guestStorage.deleteOrder(id)
      setOrders((prev) => prev.filter((o) => o.id !== id))
      return
    }

    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} deleting order`)
      }
      setOrders((prev) => prev.filter((o) => o.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error deleting order')
    }
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerName.trim() || draftItems.length === 0) return

    const matchedCustomer = customersList.find(
      (c) => c.name.toLowerCase() === customerName.trim().toLowerCase()
    )

    const orderPayload = {
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
    }

    if (auth.isGuest) {
      const created = guestStorage.createOrder(orderPayload)
      setOrders((prev) => [created, ...prev])
      setShowOrderModal(false)
      setCustomerName('')
      setOrderNotes('')
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(orderPayload),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} creating order`)
      }
      const created: Order = await res.json()
      setOrders((prev) => [created, ...prev])
      setShowOrderModal(false)
      setCustomerName('')
      setOrderNotes('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error creating order')
    } finally {
      setSubmitting(false)
    }
  }

  // ================= PRODUCTS ACTIONS =================
  const handleToggleProductAvailability = async (product: Product) => {
    if (auth.isGuest) {
      const updated = guestStorage.updateProductAvailability(product.id, !product.available)
      setProductsList((prev) => prev.map((p) => (p.id === product.id ? updated : p)))
      return
    }

    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ available: !product.available }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} updating product`)
      }
      const updated: Product = await res.json()
      setProductsList((prev) => prev.map((p) => (p.id === product.id ? updated : p)))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error updating product')
    }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product from the menu?')) return
    if (auth.isGuest) {
      guestStorage.deleteProduct(id)
      setProductsList((prev) => prev.filter((p) => p.id !== id))
      return
    }

    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} deleting product`)
      }
      setProductsList((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error deleting product')
    }
  }

  const allProductCategories = useMemo(() => {
    const unique = new Set<string>(PRODUCT_CATEGORIES)
    for (const product of productsList) {
      if (product.category?.trim()) {
        unique.add(product.category.trim())
      }
    }
    return Array.from(unique)
  }, [productsList])

  const openNewProductModal = () => {
    setEditingProduct(null)
    setProdName('')
    setProdCategory(PRODUCT_CATEGORIES[0])
    setProdPrice('4.00')
    setProdDescription('')
    setProdAvailable(true)
    setShowProductModal(true)
  }

  const openEditProductModal = (product: Product) => {
    setEditingProduct(product)
    setProdName(product.name)
    setProdCategory(product.category || PRODUCT_CATEGORIES[0])
    setProdPrice(Number(product.price).toFixed(2))
    setProdDescription(product.description || '')
    setProdAvailable(product.available)
    setShowProductModal(true)
  }

  const closeProductModal = () => {
    setShowProductModal(false)
    setEditingProduct(null)
  }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prodName.trim()) return

    const parsedPrice = Number(prodPrice)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      alert('Price must be a valid number greater than or equal to 0.')
      return
    }

    const productPayload = {
      name: prodName.trim(),
      category: prodCategory.trim() || 'Hot Coffee',
      price: parsedPrice.toFixed(2),
      description: prodDescription.trim() || null,
      available: prodAvailable,
    }

    if (editingProduct) {
      if (auth.isGuest) {
        try {
          const updated = guestStorage.updateProduct(editingProduct.id, productPayload)
          setProductsList((prev) =>
            prev.map((p) => (p.id === editingProduct.id ? updated : p))
          )
          closeProductModal()
        } catch (err) {
          alert(err instanceof Error ? err.message : 'Error updating product')
        }
        return
      }

      try {
        setSubmitting(true)
        const res = await fetch(`/api/products/${editingProduct.id}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify(productPayload),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `Error ${res.status} updating product`)
        }
        const updated: Product = await res.json()
        setProductsList((prev) =>
          prev.map((p) => (p.id === editingProduct.id ? updated : p))
        )
        closeProductModal()
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Error updating product')
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (auth.isGuest) {
      const created = guestStorage.createProduct(productPayload)
      setProductsList((prev) => [...prev, created])
      closeProductModal()
      setProdName('')
      setProdDescription('')
      setProdPrice('4.00')
      setProdAvailable(true)
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(productPayload),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} creating product`)
      }
      const created: Product = await res.json()
      setProductsList((prev) => [...prev, created])
      closeProductModal()
      setProdName('')
      setProdDescription('')
      setProdPrice('4.00')
      setProdAvailable(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error creating product')
    } finally {
      setSubmitting(false)
    }
  }

  // ================= CUSTOMERS ACTIONS =================
  const handleAddCustomerPoints = async (customer: Customer, delta: number) => {
    const nextPoints = Math.max(0, (customer.loyaltyPoints || 0) + delta)
    if (auth.isGuest) {
      const updated = guestStorage.updateCustomerPoints(customer.id, nextPoints)
      setCustomersList((prev) => prev.map((c) => (c.id === customer.id ? updated : c)))
      return
    }

    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ loyaltyPoints: nextPoints }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} updating points`)
      }
      const updated: Customer = await res.json()
      setCustomersList((prev) => prev.map((c) => (c.id === customer.id ? updated : c)))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error updating points')
    }
  }

  const handleDeleteCustomer = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) return
    if (auth.isGuest) {
      guestStorage.deleteCustomer(id)
      setCustomersList((prev) => prev.filter((c) => c.id !== id))
      return
    }

    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} deleting customer`)
      }
      setCustomersList((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error deleting customer')
    }
  }

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!custName.trim()) return

    const customerPayload = {
      name: custName.trim(),
      email: custEmail.trim() || undefined,
      phone: custPhone.trim() || undefined,
      favoriteDrink: custFavoriteDrink.trim() || undefined,
      loyaltyPoints: Number(custPoints) || 0,
    }

    if (auth.isGuest) {
      const created = guestStorage.createCustomer(customerPayload)
      setCustomersList((prev) => [created, ...prev])
      setShowCustomerModal(false)
      setCustName('')
      setCustEmail('')
      setCustPhone('')
      setCustPoints(0)
      return
    }

    try {
      setSubmitting(true)
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(customerPayload),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `Error ${res.status} registering customer`)
      }
      const created: Customer = await res.json()
      setCustomersList((prev) => [created, ...prev])
      setShowCustomerModal(false)
      setCustName('')
      setCustEmail('')
      setCustPhone('')
      setCustPoints(0)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error registering customer')
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
      {/* Auth & Guest Session Top Bar */}
      <div className={`auth-status-bar ${auth.isGuest ? 'auth-bar-guest' : 'auth-bar-user'}`}>
        <div className="auth-status-info">
          {auth.isGuest ? (
            <>
              <span className="auth-badge badge-guest">👤 Guest Mode</span>
              <span className="auth-status-text">
                Your changes are saved in browser <code>sessionStorage</code> (ID:{' '}
                <code>{auth.guestId}</code>)
              </span>
            </>
          ) : (
            <>
              <span className="auth-badge badge-authenticated">
                🔐 {auth.user?.displayName} ({auth.user?.email})
              </span>
              <span className="auth-status-text">
                Connected to <strong>PostgreSQL / Neon</strong> · Provider:{' '}
                <code>{auth.user?.provider}</code>
              </span>
            </>
          )}
        </div>

        <div className="auth-status-actions">
          {auth.isGuest ? (
            <>
              <button
                type="button"
                className="btn-auth-reset"
                onClick={handleResetGuestData}
                title="Reset demo data in sessionStorage"
              >
                🔄 Reset Demo
              </button>
              <button
                type="button"
                className="btn-auth-login"
                onClick={() => authStore.openAuthModal('login')}
              >
                🔐 Sign In
              </button>
              <button
                type="button"
                className="btn-auth-register"
                onClick={() => authStore.openAuthModal('register')}
              >
                ✨ Create Account
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-auth-logout"
                onClick={() => authStore.logoutToGuest()}
              >
                Switch to Guest Mode
              </button>
            </>
          )}
        </div>
      </div>

      {/* Business Switcher Bar */}
      <div className="business-switcher-bar">
        {auth.isGuest ? (
          <>
            <div className="business-switcher-left">
              <span className="business-switcher-label">🏪 Demo Business:</span>
              <strong>The Cloud Cafe</strong>
            </div>
            <div className="business-switcher-actions">
              <button
                type="button"
                className="btn-business-add"
                onClick={() => authStore.openAuthModal('register')}
              >
                + Create an account to add businesses
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="business-switcher-left">
              <label htmlFor="active-business-select" className="business-switcher-label">
                🏪 Active Business:
              </label>
              <select
                id="active-business-select"
                className="business-select"
                value={auth.activeBusinessId || activeBusiness?.id || ''}
                onChange={(e) => authStore.selectBusiness(e.target.value)}
                disabled={auth.businesses.length === 0}
              >
                {auth.businesses.length === 0 ? (
                  <option value="">Loading businesses...</option>
                ) : (
                  auth.businesses.map((biz) => (
                    <option key={biz.id} value={biz.id}>
                      {biz.name}
                    </option>
                  ))
                )}
              </select>
              {activeBusiness?.whatsappPhoneNumberId && (
                <span
                  className="business-wa-pill"
                  title={`WhatsApp Phone Number ID: ${activeBusiness.whatsappPhoneNumberId}`}
                >
                  📱 WhatsApp linked
                </span>
              )}
            </div>
            <div className="business-switcher-actions">
              {activeBusiness && (
                <button
                  type="button"
                  className="btn-business-edit"
                  onClick={() => {
                    setBusinessModalMode('edit')
                    setShowBusinessModal(true)
                  }}
                >
                  ⚙️ Settings
                </button>
              )}
              <button
                type="button"
                className="btn-business-add"
                onClick={() => {
                  setBusinessModalMode('create')
                  setShowBusinessModal(true)
                }}
              >
                + New Business
              </button>
            </div>
          </>
        )}
      </div>

      {/* Header */}
      <div className="orders-header">
        <div>
          <h1 className="orders-title">
            <span className="coffee-icon">☕</span>{' '}
            {!auth.isGuest && activeBusiness ? activeBusiness.name : 'Coffee Shop Dashboard'}
          </h1>
          <p className="orders-subtitle">
            {auth.isGuest
              ? 'Guest Mode Active — Ephemeral data in your browser session (sessionStorage)'
              : activeBusiness?.description ||
                'Multi-Product Orders, Catalog & Customers with PostgreSQL & Drizzle ORM'}
          </p>
        </div>
        <div className="orders-header-actions">
          <button
            type="button"
            className="btn-refresh"
            onClick={fetchAllData}
            disabled={loading}
            title="Refresh data"
          >
            <span className={loading ? 'spinning' : ''}>🔄</span> Refresh
          </button>
          {activeSection === 'orders' && (
            <button
              type="button"
              className="btn-new-order"
              onClick={() => openNewOrderModal()}
            >
              <span>+</span> New Order
            </button>
          )}
          {activeSection === 'products' && (
            <button
              type="button"
              className="btn-new-order"
              onClick={openNewProductModal}
            >
              <span>+</span> New Product
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
              <span>+</span> New Customer
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
          📋 Orders <span className="nav-badge">{stats.totalOrders}</span>
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeSection === 'products' ? 'active' : ''}`}
          onClick={() => {
            setActiveSection('products')
            setSearchQuery('')
          }}
        >
          🥐 Products <span className="nav-badge">{stats.totalProducts}</span>
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeSection === 'customers' ? 'active' : ''}`}
          onClick={() => {
            setActiveSection('customers')
            setSearchQuery('')
          }}
        >
          👥 Customers <span className="nav-badge">{stats.totalCustomers}</span>
        </button>
      </div>

      {/* Stats Cards */}
      <div className="orders-stats">
        <div className="stat-card">
          <span className="stat-label">Orders / Pending</span>
          <span className="stat-value">
            {stats.totalOrders}{' '}
            <small className="stat-subvalue">({stats.pendingOrders} pend.)</small>
          </span>
        </div>
        <div className="stat-card stat-completed">
          <span className="stat-label">Sales / Items</span>
          <span className="stat-value">
            ${stats.totalRevenue.toFixed(2)}{' '}
            <small className="stat-subvalue-neutral">({stats.totalItemsCount} items)</small>
          </span>
        </div>
        <div className="stat-card stat-pending">
          <span className="stat-label">Active Products</span>
          <span className="stat-value">
            {stats.availableProducts} / {stats.totalProducts}
          </span>
        </div>
        <div className="stat-card stat-cups">
          <span className="stat-label">Registered Customers</span>
          <span className="stat-value">{stats.totalCustomers}</span>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="orders-error-banner">
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <strong>Database connection error</strong>
            <p>{error}</p>
            <div className="error-tip">
              Tip: Is the Postgres container running? Start it with: <code>make dev-db</code>
            </div>
          </div>
          <button type="button" className="btn-retry" onClick={fetchAllData}>
            Retry
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
                ? 'Search orders by customer, product, or note...'
                : activeSection === 'products'
                ? 'Search products by name, category, or description...'
                : 'Search customers by name, email, phone, or drink...'
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
              All ({stats.totalOrders})
            </button>
            <button
              type="button"
              className={`filter-tab tab-pending ${statusFilter === 'pending' ? 'active' : ''}`}
              onClick={() => setStatusFilter('pending')}
            >
              Pending ({stats.pendingOrders})
            </button>
            <button
              type="button"
              className={`filter-tab tab-completed ${statusFilter === 'completed' ? 'active' : ''}`}
              onClick={() => setStatusFilter('completed')}
            >
              Completed ({stats.completedOrders})
            </button>
            <button
              type="button"
              className={`filter-tab tab-cancelled ${statusFilter === 'cancelled' ? 'active' : ''}`}
              onClick={() => setStatusFilter('cancelled')}
            >
              Cancelled ({stats.cancelledOrders})
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
              All ({stats.totalProducts})
            </button>
            {allProductCategories.map((cat) => (
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
              <span className="spinning">⏳</span> Loading orders...
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="orders-empty">
              <p>☕ No orders found with the current filters.</p>
              {statusFilter !== 'all' || searchQuery ? (
                <button
                  type="button"
                  className="btn-reset-filters"
                  onClick={() => {
                    setStatusFilter('all')
                    setSearchQuery('')
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-new-order"
                  onClick={() => openNewOrderModal()}
                >
                  + Create first order
                </button>
              )}
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Products ({'order_items'})</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th className="text-right">Actions</th>
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
                          <span className="order-notes">No products</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right font-bold price-cell">
                      ${Number(order.totalAmount || 0).toFixed(2)}
                    </td>
                    <td>
                      <span className={`status-pill pill-${order.status}`}>
                        {order.status === 'pending' && '⏳ Pending'}
                        {order.status === 'completed' && '✅ Completed'}
                        {order.status === 'cancelled' && '❌ Cancelled'}
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
                          title="Mark as completed"
                        >
                          ✓ Done
                        </button>
                      )}
                      {order.status === 'pending' && (
                        <button
                          type="button"
                          className="btn-action btn-cancel"
                          onClick={() => handleUpdateOrderStatus(order.id, 'cancelled')}
                          title="Cancel order"
                        >
                          ✕
                        </button>
                      )}
                      {order.status !== 'pending' && (
                        <button
                          type="button"
                          className="btn-action btn-reopen"
                          onClick={() => handleUpdateOrderStatus(order.id, 'pending')}
                          title="Reopen as pending"
                        >
                          ↩ Reopen
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-action btn-delete"
                        onClick={() => handleDeleteOrder(order.id)}
                        title="Delete order"
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
              <span className="spinning">⏳</span> Loading products...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="orders-empty">
              <p>🥐 No products found in the catalog.</p>
              {categoryFilter !== 'all' || searchQuery ? (
                <button
                  type="button"
                  className="btn-reset-filters"
                  onClick={() => {
                    setCategoryFilter('all')
                    setSearchQuery('')
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-new-order"
                  onClick={openNewProductModal}
                >
                  + Add first product
                </button>
              )}
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Availability</th>
                  <th className="text-right">Actions</th>
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
                        {product.available ? '✅ Available' : '🚫 Out of Stock'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button
                        type="button"
                        className="btn-action btn-edit"
                        onClick={() => openEditProductModal(product)}
                        title="Edit product"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        type="button"
                        className={`btn-action ${
                          product.available ? 'btn-reopen' : 'btn-complete'
                        }`}
                        onClick={() => handleToggleProductAvailability(product)}
                        title="Toggle availability"
                      >
                        {product.available ? 'Mark Out of Stock' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        className="btn-action btn-delete"
                        onClick={() => handleDeleteProduct(product.id)}
                        title="Delete product"
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
              <span className="spinning">⏳</span> Loading customers...
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="orders-empty">
              <p>👥 No registered customers found.</p>
              {searchQuery ? (
                <button
                  type="button"
                  className="btn-reset-filters"
                  onClick={() => setSearchQuery('')}
                >
                  Clear search
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-new-order"
                  onClick={() => setShowCustomerModal(true)}
                >
                  + Register first customer
                </button>
              )}
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Favorite Drink</th>
                  <th className="text-center">Loyalty Points</th>
                  <th className="text-right">Actions</th>
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
                          <span className="order-notes">No info</span>
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
                        title="Add 10 points"
                      >
                        +10 pts
                      </button>
                      <button
                        type="button"
                        className="btn-action btn-reopen"
                        onClick={() => openNewOrderModal(customer)}
                        title="Create order for this customer"
                      >
                        ☕ Order
                      </button>
                      <button
                        type="button"
                        className="btn-action btn-delete"
                        onClick={() => handleDeleteCustomer(customer.id)}
                        title="Delete customer"
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

      {/* ================= MODAL: NEW MULTI-PRODUCT ORDER ================= */}
      {showOrderModal && (
        <div className="modal-overlay" onClick={() => setShowOrderModal(false)}>
          <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>☕ New Order (Multiple Products)</h2>
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
                <label htmlFor="customer-name">Customer *</label>
                <input
                  id="customer-name"
                  type="text"
                  list="customers-datalist"
                  required
                  placeholder="Select or type the customer name"
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
                  <label>Order Items ({draftItems.length})</label>
                  <button
                    type="button"
                    className="btn-add-item"
                    onClick={handleAddDraftItem}
                  >
                    + Add another product
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
                          title="Quantity"
                        />
                        <span className="cart-row-subtotal">
                          ${((Number(item.unitPrice) || 0) * item.quantity).toFixed(2)}
                        </span>
                        {draftItems.length > 1 && (
                          <button
                            type="button"
                            className="btn-remove-item"
                            onClick={() => handleRemoveDraftItem(index)}
                            title="Remove this product"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        className="cart-row-notes"
                        placeholder="Note for this product (e.g. Oat milk, no sugar)..."
                        value={item.notes}
                        onChange={(e) => handleDraftNotesChange(index, e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                <div className="order-cart-total">
                  <span>Order Total:</span>
                  <strong>${draftTotalAmount.toFixed(2)}</strong>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="order-notes">General order notes (optional)</label>
                <input
                  id="order-notes"
                  type="text"
                  placeholder="e.g. To go, deliver to table 4"
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || !customerName.trim() || draftItems.length === 0}
                >
                  {submitting
                    ? 'Saving...'
                    : `Create Order ($${draftTotalAmount.toFixed(2)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE / EDIT PRODUCT ================= */}
      {showProductModal && (
        <div className="modal-overlay" onClick={closeProductModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingProduct ? '✏️ Edit Product' : '🥐 New Product'}</h2>
              <button
                type="button"
                className="modal-close"
                onClick={closeProductModal}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveProduct} className="modal-form">
              <div className="form-group">
                <label htmlFor="prod-name">Product Name *</label>
                <input
                  id="prod-name"
                  type="text"
                  required
                  placeholder="e.g. Caramel Macchiato"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="prod-category">Category *</label>
                  <input
                    id="prod-category"
                    type="text"
                    list="product-categories-datalist"
                    required
                    placeholder="e.g. Hot Coffee"
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                  />
                  <datalist id="product-categories-datalist">
                    {allProductCategories.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                <div className="form-group w-28">
                  <label htmlFor="prod-price">Price (USD) *</label>
                  <input
                    id="prod-price"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="prod-desc">Description</label>
                <textarea
                  id="prod-desc"
                  rows={2}
                  placeholder="e.g. Espresso with steamed milk and vanilla"
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
                  <span>Available to order immediately</span>
                </label>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={closeProductModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || !prodName.trim() || !prodCategory.trim()}
                >
                  {submitting
                    ? 'Saving...'
                    : editingProduct
                    ? 'Save Changes'
                    : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: NEW CUSTOMER ================= */}
      {showCustomerModal && (
        <div className="modal-overlay" onClick={() => setShowCustomerModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>👥 Register New Customer</h2>
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
                <label htmlFor="cust-name">Full Name *</label>
                <input
                  id="cust-name"
                  type="text"
                  required
                  placeholder="e.g. Laura Martinez"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="cust-email">Email</label>
                  <input
                    id="cust-email"
                    type="email"
                    placeholder="laura@email.com"
                    value={custEmail}
                    onChange={(e) => setCustEmail(e.target.value)}
                  />
                </div>
                <div className="form-group flex-1">
                  <label htmlFor="cust-phone">Phone</label>
                  <input
                    id="cust-phone"
                    type="text"
                    placeholder="+1 555 123 4567"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="cust-drink">Favorite Drink</label>
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
                  <label htmlFor="cust-points">Initial Points</label>
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting || !custName.trim()}
                >
                  {submitting ? 'Saving...' : 'Register Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREATE / EDIT BUSINESS ================= */}
      <BusinessModal
        open={showBusinessModal}
        mode={businessModalMode}
        business={activeBusiness}
        canDelete={auth.businesses.length > 1}
        idToken={auth.idToken}
        onClose={() => setShowBusinessModal(false)}
        onSaved={() => {
          fetchAllData()
        }}
        onDeleted={() => {
          fetchAllData()
        }}
      />

      {/* ================= MODAL: GCP IDENTITY PLATFORM AUTHENTICATION ================= */}
      <AuthModal />
    </div>
  )
}
