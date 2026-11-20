import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import AddItemForm from '../components/AddItemForm.jsx'
import { EmptyState, ErrorMessage, Loading } from '../components/Feedback.jsx'
import { AvailabilityPill, ItemPhoto } from '../components/ItemCard.jsx'

function MyItemRow({ item, onChanged, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function toggleAvailability() {
    setBusy(true)
    setError(null)
    const next = item.availability_status === 'available' ? 'unavailable' : 'available'
    try {
      const data = await api(`/api/items/${item.id}`, { method: 'PATCH', body: { availability_status: next } })
      onChanged(data.item)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/items/${item.id}`, { method: 'DELETE' })
      onDeleted(item.id)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <article className="card my-item">
      <div className="my-item-main">
        <ItemPhoto item={item} className="thumb" lazy={false} />
        <div className="my-item-info">
          <Link to={`/items/${item.id}`} className="my-item-title">{item.name}</Link>
          <div className="meta-row">
            <span className="category">{item.category}</span>
            <AvailabilityPill status={item.availability_status} />
          </div>
        </div>
        <div className="my-item-actions">
          <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={toggleAvailability}>
            Mark {item.availability_status === 'available' ? 'unavailable' : 'available'}
          </button>
          <button type="button" className="btn btn-small btn-danger-ghost" disabled={busy} onClick={remove}>
            Delete
          </button>
        </div>
      </div>
      <ErrorMessage error={error} />
    </article>
  )
}

export default function MyItems() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api('/api/items/mine')
      setItems(data.items)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const replaceItem = (updated) => setItems((list) => list.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)))

  return (
    <div className="container section">
      <h1>My Items</h1>
      <div className="two-col">
        <aside>
          <AddItemForm onCreated={(item) => setItems((list) => [{ ...item, pending_count: 0 }, ...list])} />
        </aside>
        <section>
          <h2 className="section-title">Items you lend</h2>
          {loading && <Loading label="Loading your items…" />}
          {!loading && error && <ErrorMessage error={error} onRetry={load} />}
          {!loading && !error && items.length === 0 && (
            <EmptyState title="You haven't listed anything yet">Use the form to lend your first item.</EmptyState>
          )}
          {!loading && !error && (
            <div className="stack">
              {items.map((item) => (
                <MyItemRow
                  key={item.id}
                  item={item}
                  onChanged={replaceItem}
                  onDeleted={(id) => setItems((list) => list.filter((i) => i.id !== id))}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
