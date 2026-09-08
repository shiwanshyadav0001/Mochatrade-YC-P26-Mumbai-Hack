import type { UserRole } from './types'

let currentRole: UserRole = 'ADMIN'
let currentActorId = 'analyst-alpha'

export const setActorRole = (role: UserRole, actorId = 'analyst-alpha') => {
  currentRole = role
  currentActorId = actorId
}

export const getActorRole = (): UserRole => currentRole

export const api = {
  get: async <T>(path: string): Promise<T> => {
    const res = await fetch(`/api${path}`, {
      headers: {
        'X-Actor-Role': currentRole,
        'X-Actor-Id': currentActorId,
      },
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
        'X-Actor-Role': currentRole,
        'X-Actor-Id': currentActorId,
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
