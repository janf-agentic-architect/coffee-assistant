/** @jsxImportSource react */
import React, { useEffect, useState } from 'react'
import { authStore, type BusinessProfile } from '../auth/auth-store'

interface BusinessModalProps {
  open: boolean
  mode: 'create' | 'edit'
  business?: BusinessProfile | null
  canDelete: boolean
  idToken: string | null
  onClose: () => void
  onSaved: (business: BusinessProfile, mode: 'create' | 'edit') => void
  onDeleted: (businessId: string) => void
}

export function BusinessModal({
  open,
  mode,
  business,
  canDelete,
  idToken,
  onClose,
  onSaved,
  onDeleted,
}: BusinessModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [assistantInstructions, setAssistantInstructions] = useState('')
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    if (mode === 'edit' && business) {
      setName(business.name || '')
      setDescription(business.description || '')
      setAssistantInstructions(business.assistantInstructions || '')
      setWhatsappPhoneNumberId(business.whatsappPhoneNumberId || '')
    } else {
      setName('')
      setDescription('')
      setAssistantInstructions('')
      setWhatsappPhoneNumberId('')
    }
  }, [open, mode, business])

  if (!open) return null

  const getHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`
    return headers
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setError(null)
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        assistantInstructions: assistantInstructions.trim() || null,
        whatsappPhoneNumberId: whatsappPhoneNumberId.trim() || null,
      }

      const url =
        mode === 'edit' && business ? `/api/businesses/${business.id}` : '/api/businesses'
      const method = mode === 'edit' ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        body: JSON.stringify(payload),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status} al guardar el negocio`)
      }

      const saved = data as BusinessProfile
      authStore.upsertBusiness(saved, mode === 'create')
      onSaved(saved, mode)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el negocio')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!business || !canDelete) return
    const confirmed = confirm(
      `¿Eliminar "${business.name}"? Se eliminarán permanentemente sus productos, clientes y órdenes asociados.`
    )
    if (!confirmed) return

    setError(null)
    setDeleting(true)
    try {
      const res = await fetch(`/api/businesses/${business.id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || `Error ${res.status} al eliminar el negocio`)
      }
      authStore.removeBusiness(business.id)
      onDeleted(business.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el negocio')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card business-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'create' ? '🏪 Nuevo Negocio' : '⚙️ Configurar Negocio'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="auth-error-alert">⚠️ {error}</div>}

          <div className="form-group">
            <label htmlFor="biz-name">Nombre del Negocio *</label>
            <input
              id="biz-name"
              type="text"
              required
              placeholder="Ej. Tostaduría Norte, Panadería Luna..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="biz-description">Descripción / Giro (opcional)</label>
            <textarea
              id="biz-description"
              rows={2}
              placeholder="Ej. Cafetería de especialidad en CDMX, horario de 8am a 8pm, enfoque en métodos artesanales."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="biz-instructions">
              Instrucciones del Asistente AI (opcional)
            </label>
            <textarea
              id="biz-instructions"
              rows={3}
              placeholder="Ej. Responde siempre en español con tono cálido, sugiere un croissant con cada café y menciona nuestro programa de lealtad."
              value={assistantInstructions}
              onChange={(e) => setAssistantInstructions(e.target.value)}
            />
            <span className="form-field-hint">
              Se inyectan automáticamente al agente al conversar con este negocio.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="biz-whatsapp">Número de WhatsApp o Phone Number ID (opcional)</label>
            <input
              id="biz-whatsapp"
              type="text"
              placeholder="Ej. 1 (555) 012-6859 o 109283746512345"
              value={whatsappPhoneNumberId}
              onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
            />
            <span className="form-field-hint">
              Puedes escribir el número de teléfono de tu negocio (ej. 1 (555) 012-6859) o el Phone Number ID de Meta WhatsApp Cloud API.
            </span>
          </div>

          <div className="modal-actions modal-actions-split">
            <div>
              {mode === 'edit' && business && (
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={handleDelete}
                  disabled={!canDelete || deleting || submitting}
                  title={
                    canDelete
                      ? 'Eliminar este negocio y todos sus datos'
                      : 'Debes mantener al menos un negocio activo'
                  }
                >
                  {deleting ? 'Eliminando...' : '🗑 Eliminar'}
                </button>
              )}
            </div>
            <div className="modal-actions-right">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting || deleting || !name.trim()}
              >
                {submitting
                  ? 'Guardando...'
                  : mode === 'create'
                  ? 'Crear Negocio'
                  : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
