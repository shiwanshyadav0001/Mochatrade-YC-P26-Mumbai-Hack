import type { UserRole } from './types'

export class ApiError extends Error {
  status: number
  statusText: string
  detail: string
  isAuthError: boolean
  isForbidden: boolean
  isNetworkError: boolean

  constructor(status: number, statusText: string, detail: string, isNetworkError = false) {
    super(detail || `Request failed with status ${status} (${statusText})`)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
    this.detail = detail
    this.isAuthError = status === 401
    this.isForbidden = status === 403
    this.isNetworkError = isNetworkError
  }
}

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

const getEnvCredentials = (role: UserRole): { username?: string; password?: string } => {
  switch (role) {
    case 'ADMIN':
      return {
        username: import.meta.env.VITE_NETRA_ADMIN_USERNAME,
        password: import.meta.env.VITE_NETRA_ADMIN_PASSWORD,
      }
    case 'RISK_ANALYST':
      return {
        username: import.meta.env.VITE_NETRA_RISK_ANALYST_USERNAME || import.meta.env.VITE_NETRA_ANALYST_USERNAME,
        password: import.meta.env.VITE_NETRA_RISK_ANALYST_PASSWORD || import.meta.env.VITE_NETRA_ANALYST_PASSWORD,
      }
    case 'INVESTIGATOR':
      return {
        username: import.meta.env.VITE_NETRA_INVESTIGATOR_USERNAME,
        password: import.meta.env.VITE_NETRA_INVESTIGATOR_PASSWORD,
      }
    case 'VIEWER':
      return {
        username: import.meta.env.VITE_NETRA_VIEWER_USERNAME,
        password: import.meta.env.VITE_NETRA_VIEWER_PASSWORD,
      }
    default:
      return {}
  }
}

let currentRole: UserRole = (sessionStorage.getItem('netra_actor_role') as UserRole) || 'ADMIN'
let accessToken = sessionStorage.getItem('netra_access_token') || ''

export const clearAuthSession = (): void => {
  accessToken = ''
  sessionStorage.removeItem('netra_access_token')
  sessionStorage.removeItem('netra_actor_role')
}

export const setActorRole = async (role: UserRole): Promise<void> => {
  const envCreds = getEnvCredentials(role)
  const username = envCreds.username || DEV_CREDENTIALS[role]?.username
  const password = envCreds.password || DEV_CREDENTIALS[role]?.password
  if (!username || !password) {
    throw new ApiError(400, 'Bad Request', `Authentication credentials are not configured for ${role}`)
  }

  let response: Response
  try {
    response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  } catch (err: any) {
    throw new ApiError(0, 'Network Error', 'Backend service unreachable. Ensure NETRA FastAPI is active on port 8000.', true)
  }

  if (!response.ok) {
    const errorText = await parseErrorDetail(response)
    throw new ApiError(response.status, response.statusText, errorText)
  }

  const auth = (await response.json()) as AuthResponse
  if (auth.role !== role) {
    throw new ApiError(403, 'Forbidden', `Authenticated role mismatch: expected ${role}, received ${auth.role}`)
  }
  currentRole = auth.role
  accessToken = auth.access_token
  sessionStorage.setItem('netra_access_token', accessToken)
  sessionStorage.setItem('netra_actor_role', currentRole)
}

export const getActorRole = (): UserRole => currentRole

async function parseErrorDetail(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data.detail === 'string') return data.detail
    if (Array.isArray(data.detail)) return data.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ')
    return JSON.stringify(data)
  } catch {
    return (await res.text()) || `HTTP ${res.status}: ${res.statusText}`
  }
}

export const api = {
  get: async <T>(path: string): Promise<T> => {
    let res: Response
    try {
      res = await fetch(`/api${path}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      })
    } catch {
      throw new ApiError(0, 'Network Error', 'Failed to connect to NETRA API service.', true)
    }

    if (res.status === 401) {
      try {
        await setActorRole(currentRole)
        res = await fetch(`/api${path}`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
        })
      } catch {
        // Fall through to standard error handling
      }
    }

    if (!res.ok) {
      const errDetail = await parseErrorDetail(res)
      throw new ApiError(res.status, res.statusText, errDetail)
    }
    return res.json() as Promise<T>
  },

  send: async <T>(method: string, path: string, data?: unknown): Promise<T> => {
    let res: Response
    try {
      res = await fetch(`/api${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      })
    } catch {
      throw new ApiError(0, 'Network Error', 'Failed to connect to NETRA API service.', true)
    }

    if (res.status === 401) {
      try {
        await setActorRole(currentRole)
        res = await fetch(`/api${path}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: data ? JSON.stringify(data) : undefined,
        })
      } catch {
        // Fall through to standard error handling
      }
    }

    if (!res.ok) {
      const errDetail = await parseErrorDetail(res)
      throw new ApiError(res.status, res.statusText, errDetail)
    }
    return res.json() as Promise<T>
  },

  post: async <T>(path: string, data?: unknown): Promise<T> => {
    return api.send<T>('POST', path, data)
  },
}
