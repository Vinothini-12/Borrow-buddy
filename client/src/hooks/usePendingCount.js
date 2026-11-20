import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api.js'

const POLL_MS = 30_000
export const REQUESTS_CHANGED = 'requests:changed'

// Tell the navbar badge to refresh right away (e.g. after approving a request).
export function notifyRequestsChanged() {
  window.dispatchEvent(new Event(REQUESTS_CHANGED))
}

// Number of pending requests on the user's items. Refreshes every 30 s, when the
// tab regains focus, on navigation, and when notifyRequestsChanged() is called.
export function usePendingCount(enabled) {
  const [fetched, setCount] = useState(0)
  const count = enabled ? fetched : 0
  const { pathname } = useLocation()

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      api('/api/requests/incoming/count')
        .then((data) => { if (!cancelled) setCount(data.pending) })
        .catch(() => {}) // badge is best-effort; never show an error for it
    }
    refresh()
    const timer = setInterval(refresh, POLL_MS)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener(REQUESTS_CHANGED, refresh)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener(REQUESTS_CHANGED, refresh)
    }
  }, [enabled, pathname])

  // "(2) BorrowBuddy" in the browser tab while requests are waiting.
  useEffect(() => {
    const base = 'BorrowBuddy'
    document.title = count > 0 ? `(${count}) ${base}` : base
  }, [count])

  return count
}
