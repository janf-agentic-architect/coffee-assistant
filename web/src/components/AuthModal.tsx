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
        throw new Error(data.error || `Error ${res.status} al autenticar usuario`)
      }

      authStore.setAuthenticated(data.user, data.idToken)
      setEmail('')
      setPassword('')
      setDisplayName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar la solicitud')
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
              ? '🔐 Crear Cuenta (GCP Identity Platform)'
              : '🔐 Iniciar Sesión (GCP Identity Platform)'}
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
            Iniciar Sesión
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${isRegister ? 'active' : ''}`}
            onClick={() => {
              setError(null)
              authStore.openAuthModal('register')
            }}
          >
            Crear Cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="auth-info-box">
            {isRegister ? (
              <span>
                Crea tu cuenta con usuario/correo y contraseña. Tus órdenes y productos se
                guardarán en <strong>PostgreSQL (Neon)</strong> y podrás vincular tu cuenta
                de <strong>WhatsApp Business (Tech Provider)</strong>.
              </span>
            ) : (
              <span>
                Inicia sesión para acceder a tus datos persistentes en{' '}
                <strong>PostgreSQL</strong> y gestionar tus sesiones de prueba web aisladas de
                WhatsApp.
              </span>
            )}
          </div>

          {error && <div className="auth-error-alert">⚠️ {error}</div>}

          {isRegister && (
            <div className="form-group">
              <label htmlFor="auth-display-name">Nombre / Negocio</label>
              <input
                id="auth-display-name"
                type="text"
                placeholder="Ej. Cafetería Central"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="auth-email">Usuario / Correo Electrónico *</label>
            <input
              id="auth-email"
              type="email"
              required
              placeholder="usuario@tucafeteria.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="auth-password">Contraseña * (mín. 6 caracteres)</label>
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
              Continuar como Invitado
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading
                ? 'Autenticando...'
                : isRegister
                ? 'Crear Cuenta'
                : 'Iniciar Sesión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
