import type { UserRole } from './types'

type AuthResponse = {
  access_token: string
  token_type: string
  expires_at: number
  actor_id: string
  role: UserRole
}

const DEV_CREDENTIALS: Record<UserRole, { username: string; password: string }> = {
  ADMIN: { username: 'admin', password: 'admin-pass' },
  RISK_ANALYST: { username: 'analyst', password: 'analyst-pass' },
  INVESTIGATOR: { username: 'investigator', password: 'investigator-pass' },
  VIEWER: { username: 'viewer', password: 'viewer-pass' },
}

let currentRole: UserRole = 'ADMIN'
let accessToken = sessionStorage.getItem('netra_access_token') || ''

export const setActorRole = async (role: UserRole): Promise<void> => {
  const envUser = import.meta.env[`VITE_NETRA_${role}_USERNAME`] as string | undefined
  const envPass = import.meta.env[`VITE_NETRA_${role}_PASSWORD`] as string | undefined
  const username = envUser || DEV_CREDENTIALS[role]?.username
  const password = envPass || DEV_CREDENTIALS[role]?.password
  if (!username || !password) {
    throw new Error(`Authentication credentials are not configured for ${role}`)
  }

  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    throw new Error((await response.text()) || `Login failed with status ${response.status}`)
  }

  const auth = await response.json() as AuthResponse
  if (auth.role !== role) {
    throw new Error(`Authenticated role mismatch: expected ${role}, received ${auth.role}`)
  }
  currentRole = auth.role
  accessToken = auth.access_token
  sessionStorage.setItem('netra_access_token', accessToken)
}

export const getActorRole = (): UserRole => currentRole

export const api = {
  get: async <T>(path: string): Promise<T> => {
    const res = await fetch(`/api${path}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(err || `Request failed with status ${res.status}`)
    }
    return res.json() as Promise<T>
  },
  send: async <T>(method: string, path: string, data?: unknown): Promise<T> => {
    const res = await fetch(`/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(err || `Request failed with status ${res.status}`)
    }
    return res.json() as Promise<T>
  },
}
