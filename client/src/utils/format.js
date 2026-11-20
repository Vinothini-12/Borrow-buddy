const pad = (n) => String(n).padStart(2, '0')

// Local calendar date as YYYY-MM-DD (for <input type="date"> min values).
export function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// "2026-11-30" -> "Nov 30, 2026" without timezone shifting. Full timestamps use local time.
export function formatDate(value) {
  if (!value) return ''
  const opts = { month: 'short', day: 'numeric', year: 'numeric' }
  if (value.length > 10) return new Date(value).toLocaleDateString(undefined, opts)
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts)
}

export function formatRange(start, end) {
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`
}

export function formatDateTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function dayCount(start, end) {
  const [y1, m1, d1] = start.split('-').map(Number)
  const [y2, m2, d2] = end.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1
}
