import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { EmptyState, ErrorMessage, Loading } from '../components/Feedback.jsx'
import ItemCard from '../components/ItemCard.jsx'
import { CATEGORIES } from '../constants.js'
import { getPosition, RADIUS_OPTIONS } from '../utils/geo.js'

export default function Home() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const category = params.get('category') || ''
  const near = params.get('near') || '' // radius in km, e.g. "2"
  const [position, setPosition] = useState(null)
  const [geoError, setGeoError] = useState(null)
  const locating = Boolean(near) && !position
  const [draft, setDraft] = useState(search)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  const updateParam = useCallback(
    (key, value) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // Debounce typing into the URL so we don't fetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      if (draft.trim() !== search) updateParam('search', draft.trim())
    }, 300)
    return () => clearTimeout(t)
  }, [draft, search, updateParam])

  // "Near me" needs the browser's location once; if it fails, drop back to "Anywhere".
  useEffect(() => {
    if (!near || position) return undefined
    let cancelled = false
    getPosition()
      .then((pos) => !cancelled && setPosition(pos))
      .catch((err) => {
        if (cancelled) return
        setGeoError(err.message)
        updateParam('near', '')
      })
    return () => { cancelled = true }
  }, [near, position, updateParam])

  useEffect(() => {
    if (near && !position) return undefined // wait for location
    const controller = new AbortController()
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    if (category) qs.set('category', category)
    if (near) {
      qs.set('lat', position.lat)
      qs.set('lng', position.lng)
      qs.set('radius', near)
    }
    setLoading(true)
    setError(null)
    api(`/api/items?${qs}`, { signal: controller.signal })
      .then((data) => setItems(data.items))
      .catch((err) => err.name !== 'AbortError' && setError(err))
      .finally(() => !controller.signal.aborted && setLoading(false))
    return () => controller.abort()
  }, [search, category, near, position, reloadKey])

  const filtered = search || category || near
  const busy = loading || locating

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Borrow more. Buy less.</h1>
          <p className="hero-sub">Find tools, gear and gadgets your neighbours are happy to lend, for free.</p>
          <form className="search-bar" role="search" onSubmit={(e) => { e.preventDefault(); updateParam('search', draft.trim()) }}>
            <label htmlFor="search" className="sr-only">Search items by name</label>
            <input
              id="search"
              type="search"
              placeholder="Search for a drill, bike, tent…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <label htmlFor="category" className="sr-only">Category</label>
            <select id="category" value={category} onChange={(e) => updateParam('category', e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label htmlFor="near" className="sr-only">Distance</label>
            <select id="near" value={near} onChange={(e) => { setGeoError(null); updateParam('near', e.target.value) }}>
              <option value="">Anywhere</option>
              {RADIUS_OPTIONS.map((km) => <option key={km} value={km}>Within {km} km</option>)}
            </select>
            <button type="submit" className="btn">Search</button>
          </form>
          {geoError && <div className="geo-error"><ErrorMessage error={geoError} /></div>}
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>{filtered ? 'Search results' : 'Available to borrow'}</h2>
          {!busy && !error && <span className="muted small">{items.length} item{items.length === 1 ? '' : 's'}</span>}
        </div>

        {busy && <Loading label={locating ? 'Finding your location…' : 'Finding items…'} />}
        {!busy && error && <ErrorMessage error={error} onRetry={() => setReloadKey((k) => k + 1)} />}
        {!busy && !error && items.length === 0 && (
          <EmptyState title={near && !search && !category ? `Nothing listed within ${near} km yet` : filtered ? 'No items match your search' : 'Nothing listed yet'}>
            {filtered ? (
              <div className="meta-row empty-actions">
                <Link to={`/needs${search ? `?title=${encodeURIComponent(search)}` : '?title='}`} className="btn">Post a need</Link>
                <button type="button" className="btn btn-ghost" onClick={() => { setDraft(''); setParams({}, { replace: true }) }}>
                  Clear filters
                </button>
              </div>
            ) : (
              'Be the first to lend something from My Items.'
            )}
          </EmptyState>
        )}
        {!busy && !error && items.length > 0 && (
          <div className="grid">
            {items.map((item) => <ItemCard key={item.id} item={item} />)}
          </div>
        )}
      </section>
    </>
  )
}
