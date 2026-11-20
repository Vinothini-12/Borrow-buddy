// Unset -> local dev API. Empty string -> same origin (Docker: nginx proxies /api and /uploads).
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:5050').replace(/\/$/, '')

const TOKEN_KEY = 'borrowbuddy_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable: session lasts until reload */
  }
}

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message)
    this.status = status
    this.code = code
  }
}

// api('/api/items', { method, body, form }) -> parsed JSON. Throws ApiError with the server's message.
export async function api(path, { method = 'GET', body, form, signal } = {}) {
  const headers = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) payload = form
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  let res
  try {
    res = await fetch(API_URL + path, { method, headers, body: payload, signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Cannot reach the server. Is the API running?', { status: 0, code: 'NETWORK_ERROR' })
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event('auth:expired'))
    throw new ApiError(data?.error?.message || `Request failed (${res.status})`, {
      status: res.status,
      code: data?.error?.code,
    })
  }
  return data
}

export const imageSrc = (imageUrl) => (imageUrl ? API_URL + imageUrl : null)
