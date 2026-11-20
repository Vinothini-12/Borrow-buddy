import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { EmptyState, ErrorMessage, Loading } from '../components/Feedback.jsx'
import ItemCard from '../components/ItemCard.jsx'
import { CATEGORIES } from '../constants.js'

export default function Home() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const category = params.get('category') || ''
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

  useEffect(() => {
    const controller = new AbortController()
    const qs = new URLSearchParams()
    if (search) qs.set('search', search)
    if (category) qs.set('category', category)
    setLoading(true)
    setError(null)
    api(`/api/items?${qs}`, { signal: controller.signal })
      .then((data) => setItems(data.items))
      .catch((err) => err.name !== 'AbortError' && setError(err))
      .finally(() => !controller.signal.aborted && setLoading(false))
    return () => controller.abort()
  }, [search, category, reloadKey])

  const filtered = search || category

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
            <button type="submit" className="btn">Search</button>
          </form>
        </div>
      </section>

      <section className="container section">
        <div className="section-head">
          <h2>{filtered ? 'Search results' : 'Available to borrow'}</h2>
          {!loading && !error && <span className="muted small">{items.length} item{items.length === 1 ? '' : 's'}</span>}
        </div>

        {loading && <Loading label="Finding items…" />}
        {!loading && error && <ErrorMessage error={error} onRetry={() => setReloadKey((k) => k + 1)} />}
        {!loading && !error && items.length === 0 && (
          <EmptyState title={filtered ? 'No items match your search' : 'Nothing listed yet'}>
            {filtered ? (
              <button type="button" className="btn btn-ghost" onClick={() => { setDraft(''); setParams({}, { replace: true }) }}>
                Clear filters
              </button>
            ) : (
              'Be the first to lend something from My Items.'
            )}
          </EmptyState>
        )}
        {!loading && !error && items.length > 0 && (
          <div className="grid">
            {items.map((item) => <ItemCard key={item.id} item={item} />)}
          </div>
        )}
      </section>
    </>
  )
}
