/**
 * Google Cloud Identity Platform (Identity Toolkit & Secure Token REST API)
 * Compatible with Cloudflare Workers Edge Runtime (Web Crypto API).
 * Includes automatic fallback for local development when GCP_IDENTITY_API_KEY is not yet configured.
 */

export interface AuthUserProfile {
  uid: string
  email: string
  displayName: string
  provider: 'gcp-identity-platform' | 'local-dev'
}

export interface AuthSessionResult {
  user: AuthUserProfile
  idToken: string
  refreshToken: string
  expiresIn: number
}

interface GoogleJwk {
  kid: string
  kty: string
  alg: string
  use: string
  n: string
  e: string
}

let cachedJwks: { keys: GoogleJwk[]; expiresAt: number } | null = null

// In-memory store for local-dev fallback when GCP_IDENTITY_API_KEY is not configured
const localDevUsers = new Map<
  string,
  { uid: string; email: string; displayName: string; passwordHash: string }
>()

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) {
    base64 += '='
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function signLocalJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const enc = new TextEncoder()
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput))
  return `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`
}

async function verifyLocalJwt(
  token: string,
  secret: string
): Promise<Record<string, unknown> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, sigB64] = parts
  const signingInput = `${headerB64}.${payloadB64}`
  const enc = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(sigB64),
    enc.encode(signingInput)
  )
  if (!valid) return null

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)))
  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    return null
  }
  return payload
}

async function getGooglePublicJwks(): Promise<GoogleJwk[]> {
  const now = Date.now()
  if (cachedJwks && cachedJwks.expiresAt > now) {
    return cachedJwks.keys
  }
  const res = await fetch(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
  )
  if (!res.ok) {
    throw new Error(`Failed to fetch Google SecureToken JWKs: ${res.status}`)
  }
  const data = (await res.json()) as { keys: GoogleJwk[] }
  cachedJwks = {
    keys: data.keys || [],
    expiresAt: now + 3600 * 1000,
  }
  return cachedJwks.keys
}

/**
 * Verify a Google Cloud Identity Platform JWT (RS256) or Local Dev JWT (HS256)
 */
export async function verifyIdentityToken(
  idToken: string,
  options: { gcpProjectId?: string; gcpApiKey?: string; localSecret?: string }
): Promise<AuthUserProfile | null> {
  try {
    const parts = idToken.split('.')
    if (parts.length !== 3) return null
    const headerJson = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])))
    const payloadJson = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])))

    // Check expiration
    const nowSec = Math.floor(Date.now() / 1000)
    if (typeof payloadJson.exp === 'number' && payloadJson.exp < nowSec) {
      return null
    }

    // 1. Local Dev HS256 token fallback
    if (headerJson.alg === 'HS256') {
      const secret = options.localSecret || 'coffee-assistant-local-dev-secret'
      const verified = await verifyLocalJwt(idToken, secret)
      if (!verified) return null
      return {
        uid: String(verified.sub || verified.user_id || ''),
        email: String(verified.email || ''),
        displayName: String(verified.name || verified.email || 'User'),
        provider: 'local-dev',
      }
    }

    // 2. GCP Identity Platform RS256 token verification via Google JWKs
    if (headerJson.alg === 'RS256' && headerJson.kid) {
      const jwks = await getGooglePublicJwks()
      const jwk = jwks.find((k) => k.kid === headerJson.kid)
      if (!jwk) return null

      const cryptoKey = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      )

      const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
      const signature = base64UrlDecode(parts[2])
      const isValid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        signature,
        signingInput
      )
      if (!isValid) return null

      if (options.gcpProjectId) {
        const expectedIss = `https://securetoken.google.com/${options.gcpProjectId}`
        if (payloadJson.iss !== expectedIss || payloadJson.aud !== options.gcpProjectId) {
          return null
        }
      }

      const uid = String(payloadJson.user_id || payloadJson.sub || '')
      const email = String(payloadJson.email || '')
      const displayName = String(payloadJson.name || email.split('@')[0] || 'User')
      return {
        uid,
        email,
        displayName,
        provider: 'gcp-identity-platform',
      }
    }

    return null
  } catch {
    return null
  }
}

function mapIdentityError(code?: string): string {
  switch (code) {
    case 'EMAIL_EXISTS':
      return 'An account with this email address already exists.'
    case 'INVALID_EMAIL':
      return 'The email address format is invalid.'
    case 'WEAK_PASSWORD':
    case 'WEAK_PASSWORD : Password should be at least 6 characters':
      return 'Password must be at least 6 characters long.'
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'INVALID_PASSWORD':
      return 'Invalid email or password.'
    case 'USER_DISABLED':
      return 'This user account has been disabled.'
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Too many failed attempts. Please try again later.'
    default:
      return code ? `Authentication error (${code})` : 'Authentication error'
  }
}

/**
 * Register a new user with Email/Username & Password in GCP Identity Platform
 */
export async function registerWithEmailPassword(params: {
  email: string
  password: string
  displayName?: string
  gcpApiKey?: string
  localSecret?: string
}): Promise<AuthSessionResult> {
  const cleanEmail = params.email.trim().toLowerCase()
  const cleanName = (params.displayName || cleanEmail.split('@')[0]).trim()

  if (params.password.length < 6) {
    throw new Error('Password must be at least 6 characters long.')
  }

  // If GCP_IDENTITY_API_KEY is configured, use Google Cloud Identity Platform REST API
  if (params.gcpApiKey) {
    const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(
      params.gcpApiKey
    )}`
    const signUpRes = await fetch(signUpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        password: params.password,
        returnSecureToken: true,
      }),
    })
    const signUpData = (await signUpRes.json()) as {
      localId?: string
      email?: string
      idToken?: string
      refreshToken?: string
      expiresIn?: string
      error?: { message?: string }
    }

    if (!signUpRes.ok || !signUpData.idToken || !signUpData.localId) {
      throw new Error(mapIdentityError(signUpData.error?.message))
    }

    let finalToken = signUpData.idToken

    // Update displayName in Identity Platform
    if (cleanName) {
      const updateUrl = `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${encodeURIComponent(
        params.gcpApiKey
      )}`
      const updateRes = await fetch(updateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: signUpData.idToken,
          displayName: cleanName,
          returnSecureToken: true,
        }),
      })
      if (updateRes.ok) {
        const updateData = (await updateRes.json()) as { idToken?: string }
        if (updateData.idToken) finalToken = updateData.idToken
      }
    }

    return {
      user: {
        uid: signUpData.localId,
        email: signUpData.email || cleanEmail,
        displayName: cleanName,
        provider: 'gcp-identity-platform',
      },
      idToken: finalToken,
      refreshToken: signUpData.refreshToken || '',
      expiresIn: Number(signUpData.expiresIn) || 3600,
    }
  }

  // Local Dev Fallback when GCP_IDENTITY_API_KEY is not set yet
  if (localDevUsers.has(cleanEmail)) {
    throw new Error('An account with this email address already exists.')
  }
  const passwordHash = await sha256Hex(params.password)
  const uidHash = (await sha256Hex(cleanEmail)).slice(0, 16)
  const uid = `usr_${uidHash}`

  localDevUsers.set(cleanEmail, {
    uid,
    email: cleanEmail,
    displayName: cleanName,
    passwordHash,
  })

  const nowSec = Math.floor(Date.now() / 1000)
  const secret = params.localSecret || 'coffee-assistant-local-dev-secret'
  const idToken = await signLocalJwt(
    {
      sub: uid,
      user_id: uid,
      email: cleanEmail,
      name: cleanName,
      iat: nowSec,
      exp: nowSec + 86400,
    },
    secret
  )

  return {
    user: {
      uid,
      email: cleanEmail,
      displayName: cleanName,
      provider: 'local-dev',
    },
    idToken,
    refreshToken: 'local-dev-refresh-token',
    expiresIn: 86400,
  }
}

/**
 * Sign in an existing user with Email/Username & Password in GCP Identity Platform
 */
export async function signInWithEmailPassword(params: {
  email: string
  password: string
  gcpApiKey?: string
  localSecret?: string
}): Promise<AuthSessionResult> {
  const cleanEmail = params.email.trim().toLowerCase()

  if (params.gcpApiKey) {
    const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(
      params.gcpApiKey
    )}`
    const signInRes = await fetch(signInUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        password: params.password,
        returnSecureToken: true,
      }),
    })
    const signInData = (await signInRes.json()) as {
      localId?: string
      email?: string
      displayName?: string
      idToken?: string
      refreshToken?: string
      expiresIn?: string
      error?: { message?: string }
    }

    if (!signInRes.ok || !signInData.idToken || !signInData.localId) {
      throw new Error(mapIdentityError(signInData.error?.message))
    }

    const displayName =
      signInData.displayName || (signInData.email || cleanEmail).split('@')[0] || 'User'

    return {
      user: {
        uid: signInData.localId,
        email: signInData.email || cleanEmail,
        displayName,
        provider: 'gcp-identity-platform',
      },
      idToken: signInData.idToken,
      refreshToken: signInData.refreshToken || '',
      expiresIn: Number(signInData.expiresIn) || 3600,
    }
  }

  // Local Dev Fallback
  const existing = localDevUsers.get(cleanEmail)
  const passwordHash = await sha256Hex(params.password)
  if (!existing || existing.passwordHash !== passwordHash) {
    throw new Error('Invalid email or password.')
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const secret = params.localSecret || 'coffee-assistant-local-dev-secret'
  const idToken = await signLocalJwt(
    {
      sub: existing.uid,
      user_id: existing.uid,
      email: existing.email,
      name: existing.displayName,
      iat: nowSec,
      exp: nowSec + 86400,
    },
    secret
  )

  return {
    user: {
      uid: existing.uid,
      email: existing.email,
      displayName: existing.displayName,
      provider: 'local-dev',
    },
    idToken,
    refreshToken: 'local-dev-refresh-token',
    expiresIn: 86400,
  }
}
