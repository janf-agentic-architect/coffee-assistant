/** @jsxImportSource react */
import { useSyncExternalStore } from 'react'

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  businessId?: string
  provider: 'gcp-identity-platform' | 'local-dev'
}

export interface BusinessProfile {
  id: string
  ownerUserId: string
  name: string
  description?: string | null
  assistantInstructions?: string | null
  whatsappPhoneNumberId?: string | null
  createdAt: string
  updatedAt: string
}

export interface WebTestSession {
  id: string
  label: string
  adkUserId: string
  adkSessionId?: string
  createdAt: string
}

export interface AuthState {
  isGuest: boolean
  guestId: string
  user: UserProfile | null
  idToken: string | null
  businesses: BusinessProfile[]
  activeBusinessId: string | null
  sessions: WebTestSession[]
  activeSessionId: string
  activeAdkUserId: string
  showAuthModal: boolean
  authModalTab: 'login' | 'register'
}

const GUEST_ID_STORAGE_KEY = 'coffee_guest_id_v1'
const AUTH_SESSION_STORAGE_KEY = 'coffee_auth_session_v1'
const WEB_SESSIONS_PREFIX = 'coffee_web_sessions_v1_'
const ACTIVE_BUSINESS_PREFIX = 'coffee_active_business_v1_'

function loadSavedActiveBusinessId(uid: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(`${ACTIVE_BUSINESS_PREFIX}${uid}`)
  } catch {
    return null
  }
}

function saveActiveBusinessId(uid: string, businessId: string | null) {
  if (typeof window === 'undefined') return
  try {
    const key = `${ACTIVE_BUSINESS_PREFIX}${uid}`
    if (businessId) {
      window.localStorage.setItem(key, businessId)
    } else {
      window.localStorage.removeItem(key)
    }
  } catch {
    // Ignore storage quota errors
  }
}

function generateShortId(): string {
  const bytes = new Uint8Array(4)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function getOrCreateGuestId(): string {
  if (typeof window === 'undefined') return 'guest_server'
  let id = window.sessionStorage.getItem(GUEST_ID_STORAGE_KEY)
  if (!id) {
    id = `guest_${generateShortId()}`
    window.sessionStorage.setItem(GUEST_ID_STORAGE_KEY, id)
  }
  return id
}

function buildAdkUserId(ownerKey: string, isGuest: boolean): string {
  // Always prefixed with guest_ or web_ so web playground sessions stay 100% separate from wa_<phone> WhatsApp sessions.
  // All web sessions of the same user share the same ADK user_id so `user:` state persists across conversations.
  const cleanOwner = ownerKey.replace(/[^a-zA-Z0-9_-]/g, '')
  const prefix = isGuest ? 'guest' : 'web'
  return `${prefix}_${cleanOwner}`
}

function loadOrInitSessions(ownerKey: string, isGuest: boolean): {
  sessions: WebTestSession[]
  activeSessionId: string
} {
  const canonicalAdkUserId = buildAdkUserId(ownerKey, isGuest)

  if (typeof window === 'undefined') {
    const defaultSession: WebTestSession = {
      id: 's1',
      label: 'Web Session #1',
      adkUserId: canonicalAdkUserId,
      createdAt: new Date().toISOString(),
    }
    return { sessions: [defaultSession], activeSessionId: defaultSession.id }
  }

  const storageKey = `${WEB_SESSIONS_PREFIX}${ownerKey}`
  const storage = isGuest ? window.sessionStorage : window.localStorage
  try {
    const raw = storage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as {
        sessions: WebTestSession[]
        activeSessionId: string
      }
      if (Array.isArray(parsed.sessions) && parsed.sessions.length > 0) {
        const firstUserId = parsed.sessions[0]?.adkUserId
        const sharedUserId =
          firstUserId &&
          !firstUserId.includes('_s_') &&
          !firstUserId.endsWith(`_${parsed.sessions[0].id}`)
            ? firstUserId
            : canonicalAdkUserId
        const normalizedSessions = parsed.sessions.map((s) => ({
          ...s,
          adkUserId: sharedUserId,
        }))
        const active =
          normalizedSessions.find((s) => s.id === parsed.activeSessionId) ||
          normalizedSessions[0]
        return {
          sessions: normalizedSessions,
          activeSessionId: active.id,
        }
      }
    }
  } catch {
    // Fallback to default session
  }

  const sId = `s_${generateShortId()}`
  const initialSession: WebTestSession = {
    id: sId,
    label: 'Web Session #1',
    adkUserId: canonicalAdkUserId,
    createdAt: new Date().toISOString(),
  }
  const result = { sessions: [initialSession], activeSessionId: initialSession.id }
  try {
    storage.setItem(storageKey, JSON.stringify(result))
  } catch {
    // Ignore storage quota errors
  }
  return result
}

function saveSessionsToStorage(
  ownerKey: string,
  isGuest: boolean,
  sessions: WebTestSession[],
  activeSessionId: string
) {
  if (typeof window === 'undefined') return
  const storageKey = `${WEB_SESSIONS_PREFIX}${ownerKey}`
  const storage = isGuest ? window.sessionStorage : window.localStorage
  try {
    storage.setItem(storageKey, JSON.stringify({ sessions, activeSessionId }))
  } catch {
    // Ignore quota errors
  }
}

function loadInitialState(): AuthState {
  const guestId = getOrCreateGuestId()

  if (typeof window !== 'undefined') {
    try {
      const savedAuth = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
      if (savedAuth) {
        const parsed = JSON.parse(savedAuth) as { user: UserProfile; idToken: string }
        if (parsed?.user?.uid && parsed?.idToken) {
          const { sessions, activeSessionId } = loadOrInitSessions(parsed.user.uid, false)
          const activeSession =
            sessions.find((s) => s.id === activeSessionId) || sessions[0]
          const savedBusinessId =
            loadSavedActiveBusinessId(parsed.user.uid) || parsed.user.businessId || null
          return {
            isGuest: false,
            guestId,
            user: parsed.user,
            idToken: parsed.idToken,
            businesses: [],
            activeBusinessId: savedBusinessId,
            sessions,
            activeSessionId: activeSession.id,
            activeAdkUserId: activeSession.adkUserId,
            showAuthModal: false,
            authModalTab: 'login',
          }
        }
      }
    } catch {
      // Fallback to guest
    }
  }

  const { sessions, activeSessionId } = loadOrInitSessions(guestId, true)
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0]

  return {
    isGuest: true,
    guestId,
    user: null,
    idToken: null,
    businesses: [],
    activeBusinessId: null,
    sessions,
    activeSessionId: activeSession.id,
    activeAdkUserId: activeSession.adkUserId,
    showAuthModal: false,
    authModalTab: 'login',
  }
}

let state: AuthState = loadInitialState()
const listeners = new Set<() => void>()

function emitChange() {
  for (const listener of listeners) {
    listener()
  }
}

export const authStore = {
  getState(): AuthState {
    return state
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  openAuthModal(tab: 'login' | 'register' = 'login') {
    state = { ...state, showAuthModal: true, authModalTab: tab }
    emitChange()
  },

  closeAuthModal() {
    state = { ...state, showAuthModal: false }
    emitChange()
  },

  setAuthenticated(user: UserProfile, idToken: string) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        AUTH_SESSION_STORAGE_KEY,
        JSON.stringify({ user, idToken })
      )
    }
    const { sessions, activeSessionId } = loadOrInitSessions(user.uid, false)
    const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0]
    const savedBusinessId = loadSavedActiveBusinessId(user.uid) || user.businessId || null

    state = {
      ...state,
      isGuest: false,
      user,
      idToken,
      businesses: [],
      activeBusinessId: savedBusinessId,
      sessions,
      activeSessionId: activeSession.id,
      activeAdkUserId: activeSession.adkUserId,
      showAuthModal: false,
    }
    emitChange()
  },

  setBusinesses(businessesList: BusinessProfile[], preferredActiveId?: string) {
    const uid = state.user?.uid
    const candidateId =
      preferredActiveId || state.activeBusinessId || (uid ? loadSavedActiveBusinessId(uid) : null)
    const matched = businessesList.find((b) => b.id === candidateId) || businessesList[0] || null
    const nextActiveId = matched ? matched.id : null
    if (uid) {
      saveActiveBusinessId(uid, nextActiveId)
    }
    state = {
      ...state,
      businesses: businessesList,
      activeBusinessId: nextActiveId,
    }
    emitChange()
  },

  selectBusiness(businessId: string) {
    const exists = state.businesses.some((b) => b.id === businessId)
    if (!exists || state.activeBusinessId === businessId) return
    if (state.user?.uid) {
      saveActiveBusinessId(state.user.uid, businessId)
    }
    state = {
      ...state,
      activeBusinessId: businessId,
    }
    emitChange()
  },

  upsertBusiness(business: BusinessProfile, selectIt = false) {
    const exists = state.businesses.some((b) => b.id === business.id)
    const nextBusinesses = exists
      ? state.businesses.map((b) => (b.id === business.id ? business : b))
      : [...state.businesses, business]
    const nextActiveId = selectIt ? business.id : state.activeBusinessId || business.id
    if (state.user?.uid && nextActiveId) {
      saveActiveBusinessId(state.user.uid, nextActiveId)
    }
    state = {
      ...state,
      businesses: nextBusinesses,
      activeBusinessId: nextActiveId,
    }
    emitChange()
  },

  removeBusiness(businessId: string) {
    const nextBusinesses = state.businesses.filter((b) => b.id !== businessId)
    const nextActiveId =
      state.activeBusinessId === businessId
        ? nextBusinesses[0]?.id || null
        : state.activeBusinessId
    if (state.user?.uid) {
      saveActiveBusinessId(state.user.uid, nextActiveId)
    }
    state = {
      ...state,
      businesses: nextBusinesses,
      activeBusinessId: nextActiveId,
    }
    emitChange()
  },

  logoutToGuest() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
    }
    const guestId = getOrCreateGuestId()
    const { sessions, activeSessionId } = loadOrInitSessions(guestId, true)
    const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0]

    state = {
      ...state,
      isGuest: true,
      guestId,
      user: null,
      idToken: null,
      businesses: [],
      activeBusinessId: null,
      sessions,
      activeSessionId: activeSession.id,
      activeAdkUserId: activeSession.adkUserId,
      showAuthModal: false,
    }
    emitChange()
  },

  createNewWebSession(customLabel?: string) {
    const ownerKey = state.isGuest ? state.guestId : state.user!.uid
    const sId = `s_${generateShortId()}`
    const nextNumber = state.sessions.length + 1
    const newSession: WebTestSession = {
      id: sId,
      label: customLabel?.trim() || `Web Session #${nextNumber}`,
      adkUserId: state.activeAdkUserId || buildAdkUserId(ownerKey, state.isGuest),
      createdAt: new Date().toISOString(),
    }
    const nextSessions = [...state.sessions, newSession]
    saveSessionsToStorage(ownerKey, state.isGuest, nextSessions, newSession.id)

    state = {
      ...state,
      sessions: nextSessions,
      activeSessionId: newSession.id,
      activeAdkUserId: newSession.adkUserId,
    }
    emitChange()
  },

  createNewTestUser() {
    const newShortId = generateShortId()
    if (state.isGuest) {
      const oldStorageKey = `${WEB_SESSIONS_PREFIX}${state.guestId}`
      const newGuestId = `guest_${newShortId}`
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem(oldStorageKey)
          window.sessionStorage.setItem(GUEST_ID_STORAGE_KEY, newGuestId)
        } catch {
          // Ignore storage errors
        }
      }
      const { sessions, activeSessionId } = loadOrInitSessions(newGuestId, true)
      const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0]
      state = {
        ...state,
        guestId: newGuestId,
        sessions,
        activeSessionId: activeSession.id,
        activeAdkUserId: activeSession.adkUserId,
      }
      emitChange()
      return
    }

    // Authenticated user testing a fresh ADK user profile in the web playground
    const ownerKey = state.user!.uid
    const newAdkUserId = `${buildAdkUserId(ownerKey, false)}_${newShortId}`
    const sId = `s_${generateShortId()}`
    const initialSession: WebTestSession = {
      id: sId,
      label: 'Web Session #1',
      adkUserId: newAdkUserId,
      createdAt: new Date().toISOString(),
    }
    const nextSessions = [initialSession]
    saveSessionsToStorage(ownerKey, false, nextSessions, initialSession.id)
    state = {
      ...state,
      sessions: nextSessions,
      activeSessionId: initialSession.id,
      activeAdkUserId: newAdkUserId,
    }
    emitChange()
  },

  setWebSessionAdkId(sessionId: string, adkSessionId: string | undefined) {
    const target = state.sessions.find((s) => s.id === sessionId)
    if (!target || target.adkSessionId === adkSessionId) return
    const ownerKey = state.isGuest ? state.guestId : state.user!.uid
    const nextSessions = state.sessions.map((s) =>
      s.id === sessionId ? { ...s, adkSessionId } : s
    )
    saveSessionsToStorage(ownerKey, state.isGuest, nextSessions, state.activeSessionId)

    state = {
      ...state,
      sessions: nextSessions,
    }
    emitChange()
  },

  selectWebSession(sessionId: string) {
    const found = state.sessions.find((s) => s.id === sessionId)
    if (!found) return
    const ownerKey = state.isGuest ? state.guestId : state.user!.uid
    saveSessionsToStorage(ownerKey, state.isGuest, state.sessions, found.id)

    state = {
      ...state,
      activeSessionId: found.id,
      activeAdkUserId: found.adkUserId,
    }
    emitChange()
  },

  deleteWebSession(sessionId: string) {
    if (state.sessions.length <= 1) return
    const ownerKey = state.isGuest ? state.guestId : state.user!.uid
    const nextSessions = state.sessions.filter((s) => s.id !== sessionId)
    const nextActive =
      state.activeSessionId === sessionId
        ? nextSessions[nextSessions.length - 1]
        : nextSessions.find((s) => s.id === state.activeSessionId) || nextSessions[0]

    saveSessionsToStorage(ownerKey, state.isGuest, nextSessions, nextActive.id)

    state = {
      ...state,
      sessions: nextSessions,
      activeSessionId: nextActive.id,
      activeAdkUserId: nextActive.adkUserId,
    }
    emitChange()
  },
}

export function useAuth(): AuthState {
  return useSyncExternalStore(authStore.subscribe, authStore.getState, authStore.getState)
}
