import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api.js'

const POLL_MS = 30_000
export const REQUESTS_CHANGED = 'requests:changed'

// Tell the navbar badges to refresh right away (e.g. after approving a request or making an offer).
export function notifyRequestsChanged() {
  window.dispatchEvent(new Event(REQUESTS_CHANGED))
}

// Polls a count endpoint for a navbar badge. Refreshes every 30 s, when the tab regains
// focus, on navigation, and when notifyRequestsChanged() is called.
export function usePolledCount(enabled, path, field) {
  const [fetched, setCount] = useState(0)
  const count = enabled ? fetched : 0
  const { pathname } = useLocation()

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      api(path)
        .then((data) => { if (!cancelled) setCount(data[field]) })
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
  }, [enabled, path, field, pathname])

  return count
}

// "(3) BorrowBuddy" in the browser tab while something needs the user's attention.
export function useTitleCount(count) {
  useEffect(() => {
    const base = 'BorrowBuddy'
    document.title = count > 0 ? `(${count}) ${base}` : base
  }, [count])
}
