/** @jsxImportSource react */
import React, { useState } from 'react'
import { authStore, useAuth } from '../auth/auth-store'

export function AuthModal() {
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!auth.showAuthModal) return null

  const isRegister = auth.authModalTab === 'register'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) return

    try {
      setLoading(true)
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: isRegister ? displayName.trim() : undefined,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status} authenticating user`)
      }

      authStore.setAuthenticated(data.user, data.idToken)
      setEmail('')
      setPassword('')
      setDisplayName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error processing request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => authStore.closeAuthModal()}>
      <div className="modal-card auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {isRegister
              ? '🔐 Create Account (GCP Identity Platform)'
              : '🔐 Sign In (GCP Identity Platform)'}
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={() => authStore.closeAuthModal()}
          >
            ✕
          </button>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn ${!isRegister ? 'active' : ''}`}
            onClick={() => {
              setError(null)
              authStore.openAuthModal('login')
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${isRegister ? 'active' : ''}`}
            onClick={() => {
              setError(null)
              authStore.openAuthModal('register')
            }}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="auth-info-box">
            {isRegister ? (
              <span>
                Create your account with an email and password. Your orders and products will
                be saved in <strong>PostgreSQL (Neon)</strong> and you can link your{' '}
                <strong>WhatsApp Business (Tech Provider)</strong> account.
              </span>
            ) : (
              <span>
                Sign in to access your persistent data in{' '}
                <strong>PostgreSQL</strong> and manage your web test sessions isolated from
                WhatsApp.
              </span>
            )}
          </div>

          {error && <div className="auth-error-alert">⚠️ {error}</div>}

          {isRegister && (
            <div className="form-group">
              <label htmlFor="auth-display-name">Name / Business</label>
              <input
                id="auth-display-name"
                type="text"
                placeholder="e.g. Central Coffee Shop"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="auth-email">Username / Email *</label>
            <input
              id="auth-email"
              type="email"
              required
              placeholder="user@yourcoffeeshop.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-password">Password * (min. 6 characters)</label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={6}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => authStore.closeAuthModal()}
            >
              Continue as Guest
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading
                ? 'Authenticating...'
                : isRegister
                ? 'Create Account'
                : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
