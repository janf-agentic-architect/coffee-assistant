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
        throw new Error(data.error || `Error ${res.status} saving business`)
      }

      const saved = data as BusinessProfile
      authStore.upsertBusiness(saved, mode === 'create')
      onSaved(saved, mode)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error saving business')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!business || !canDelete) return
    const confirmed = confirm(
      `Delete "${business.name}"? Its associated products, customers, and orders will be permanently deleted.`
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
        throw new Error(data.error || `Error ${res.status} deleting business`)
      }
      authStore.removeBusiness(business.id)
      onDeleted(business.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting business')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card business-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{mode === 'create' ? '🏪 New Business' : '⚙️ Configure Business'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="auth-error-alert">⚠️ {error}</div>}

          <div className="form-group">
            <label htmlFor="biz-name">Business Name *</label>
            <input
              id="biz-name"
              type="text"
              required
              placeholder="e.g. North Roastery, Luna Bakery..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="biz-description">Description / Category (optional)</label>
            <textarea
              id="biz-description"
              rows={2}
              placeholder="e.g. Specialty coffee shop open 8am to 8pm, focused on artisanal pour-over methods."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="biz-instructions">
              AI Assistant Instructions (optional)
            </label>
            <textarea
              id="biz-instructions"
              rows={3}
              placeholder="e.g. Always respond with a warm tone, suggest a croissant with every coffee, and mention our loyalty program."
              value={assistantInstructions}
              onChange={(e) => setAssistantInstructions(e.target.value)}
            />
            <span className="form-field-hint">
              Automatically injected into the agent when chatting with this business.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="biz-whatsapp">WhatsApp Number or Phone Number ID (optional)</label>
            <input
              id="biz-whatsapp"
              type="text"
              placeholder="e.g. 1 (555) 012-6859 or 109283746512345"
              value={whatsappPhoneNumberId}
              onChange={(e) => setWhatsappPhoneNumberId(e.target.value)}
            />
            <span className="form-field-hint">
              You can enter your business phone number (e.g. 1 (555) 012-6859) or the Meta WhatsApp Cloud API Phone Number ID.
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
                      ? 'Delete this business and all its data'
                      : 'You must keep at least one active business'
                  }
                >
                  {deleting ? 'Deleting...' : '🗑 Delete'}
                </button>
              )}
            </div>
            <div className="modal-actions-right">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting || deleting || !name.trim()}
              >
                {submitting
                  ? 'Saving...'
                  : mode === 'create'
                  ? 'Create Business'
                  : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
