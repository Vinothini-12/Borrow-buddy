import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { EmptyState, ErrorMessage, Loading } from '../components/Feedback.jsx'
import { ItemPhoto } from '../components/ItemCard.jsx'
import { CATEGORIES } from '../constants.js'
import { notifyRequestsChanged } from '../hooks/usePendingCount.js'
import { formatDate, formatRange, todayIso } from '../utils/format.js'

const EMPTY = { title: '', description: '', category: '', needed_from: '', needed_until: '' }

function PostNeedForm({ initialTitle, onPosted, onCancel }) {
  const today = todayIso()
  const [form, setForm] = useState({ ...EMPTY, title: initialTitle })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function changeFrom(e) {
    const value = e.target.value
    setForm((f) => ({ ...f, needed_from: value, needed_until: f.needed_until && f.needed_until < value ? value : f.needed_until }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { need } = await api('/api/needs', { method: 'POST', body: form })
      onPosted(need)
    } catch (err) {
      setError(err)
      setSubmitting(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <h2>What do you need?</h2>
      <p className="muted small">Neighbours who own one get alerted and can offer it to you.</p>
      <ErrorMessage error={error} />
      <label className="field">
        <span>Item</span>
        <input required maxLength={120} value={form.title} onChange={set('title')} placeholder="e.g. Ladder, at least 6 ft" />
      </label>
      <label className="field">
        <span>Details <small className="muted">(optional)</small></span>
        <textarea rows={2} maxLength={1000} value={form.description} onChange={set('description')} placeholder="What it's for, any must-haves…" />
      </label>
      <label className="field">
        <span>Category</span>
        <select required value={form.category} onChange={set('category')}>
          <option value="" disabled>Choose…</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <div className="field-row">
        <label className="field">
          <span>From</span>
          <input type="date" required min={today} value={form.needed_from} onChange={changeFrom} />
        </label>
        <label className="field">
          <span>Until</span>
          <input type="date" required min={form.needed_from || today} value={form.needed_until} onChange={set('needed_until')} />
        </label>
      </div>
      <div className="meta-row">
        <button type="submit" className="btn" disabled={submitting}>{submitting ? 'Posting…' : 'Post need'}</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}

// "I have this": pick one of my available items to offer.
function OfferPicker({ need, myItems, onOffered }) {
  const available = myItems
    .filter((i) => i.availability_status === 'available')
    .sort((a, b) => (b.category === need.category) - (a.category === need.category))
  const [itemId, setItemId] = useState(available[0]?.id ?? '')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (available.length === 0) {
    return (
      <p className="muted small">
        You have no available items to offer. <Link to="/my-items">List one in My Items</Link>, then come back.
      </p>
    )
  }

  async function offer() {
    setBusy(true)
    setError(null)
    try {
      await api(`/api/needs/${need.id}/offers`, { method: 'POST', body: { item_id: Number(itemId) } })
      notifyRequestsChanged()
      onOffered(need.id)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <div className="offer-picker">
      <label className="sr-only" htmlFor={`offer-${need.id}`}>Item to offer</label>
      <select id={`offer-${need.id}`} value={itemId} onChange={(e) => setItemId(e.target.value)}>
        {available.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.category})</option>)}
      </select>
      <button type="button" className="btn btn-small" disabled={busy} onClick={offer}>{busy ? 'Offering…' : 'Offer it'}</button>
      <ErrorMessage error={error} />
    </div>
  )
}

function NeighbourNeed({ need, myItems, onOffered }) {
  const [picking, setPicking] = useState(false)
  return (
    <article className={`card need-card ${need.matches_my_items && !need.offered_by_me ? 'need-match' : ''}`}>
      <div className="meta-row">
        <strong>{need.title}</strong>
        <span className="category">{need.category}</span>
        {need.matches_my_items && !need.offered_by_me && <span className="badge badge-approved no-cap">You may have this</span>}
      </div>
      <p className="small request-card-line">{formatRange(need.needed_from, need.needed_until)} · {need.user_name}</p>
      {need.description && <p className="muted small request-card-line">{need.description}</p>}
      <div className="need-actions">
        <span className="muted small">{need.offer_count} offer{need.offer_count === 1 ? '' : 's'} so far</span>
        {need.is_mine ? (
          <span className="muted small">Your need</span>
        ) : need.offered_by_me ? (
          <span className="badge badge-returned no-cap">✓ You offered</span>
        ) : picking ? (
          <OfferPicker need={need} myItems={myItems} onOffered={onOffered} />
        ) : (
          <button type="button" className="btn btn-small" onClick={() => setPicking(true)}>I have this</button>
        )}
      </div>
    </article>
  )
}

function MyNeed({ need, onClosed }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const open = need.status === 'open' && !need.expired
  const qs = new URLSearchParams({ start: need.needed_from, end: need.needed_until })

  async function close() {
    if (!window.confirm(`Close "${need.title}"? Neighbours will no longer see it.`)) return
    setBusy(true)
    setError(null)
    try {
      await api(`/api/needs/${need.id}/close`, { method: 'PATCH' })
      onClosed(need.id)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <article className="card need-card">
      <div className="meta-row">
        <strong>{need.title}</strong>
        <span className="category">{need.category}</span>
        <span className={`badge ${open ? 'badge-pending' : 'badge-returned'}`}>{open ? 'Open' : need.expired && need.status === 'open' ? 'Expired' : 'Closed'}</span>
        {open && <button type="button" className="btn btn-small btn-ghost need-close" disabled={busy} onClick={close}>Close</button>}
      </div>
      <p className="small request-card-line">{formatRange(need.needed_from, need.needed_until)} · posted {formatDate(need.created_at)}</p>
      <ErrorMessage error={error} />
      <div className="request-list">
        <p className="request-list-title">Offers ({need.offers.length})</p>
        {need.offers.length === 0 && <p className="muted small request-list-note">No offers yet. Neighbours with a {need.category} item have been alerted.</p>}
        {need.offers.map((o) => (
          <div key={o.id} className="offer-row">
            <ItemPhoto item={{ name: o.item_name, image_url: o.item_image_url }} className="thumb thumb-sm" lazy={false} />
            <div className="request-card-info">
              <Link to={`/items/${o.item_id}`} className="my-item-title">{o.item_name}</Link>
              <p className="muted small request-card-line">from {o.owner_name}</p>
            </div>
            {open && o.item_availability === 'available' && (
              <Link to={`/items/${o.item_id}?${qs}`} className="btn btn-small">Request it</Link>
            )}
          </div>
        ))}
      </div>
    </article>
  )
}

export default function Needs() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'mine' ? 'mine' : 'board'
  const prefillTitle = params.get('title') || ''
  const [showForm, setShowForm] = useState(Boolean(prefillTitle))
  const [board, setBoard] = useState([])
  const [mine, setMine] = useState([])
  const [myItems, setMyItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [posted, setPosted] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [b, m, items] = await Promise.all([api('/api/needs'), api('/api/needs/mine'), api('/api/items/mine')])
      setBoard(b.needs)
      setMine(m.needs)
      setMyItems(items.items)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const setTab = (t) => setParams(t === 'mine' ? { tab: 'mine' } : {}, { replace: true })
  const neighbours = board.filter((n) => !n.is_mine)
  // Needs I can help with first.
  const sorted = [...neighbours].sort(
    (a, b) => (b.matches_my_items && !b.offered_by_me) - (a.matches_my_items && !a.offered_by_me),
  )

  function handlePosted(need) {
    setShowForm(false)
    setPosted(need)
    setParams({ tab: 'mine' }, { replace: true })
    load()
  }

  return (
    <div className="container section">
      <div className="section-head">
        <div>
          <h1>Need it</h1>
          <p className="muted">Can't find something? Ask your neighbours, and help them when you can.</p>
        </div>
        {!showForm && <button type="button" className="btn" onClick={() => { setPosted(null); setShowForm(true) }}>+ Post a need</button>}
      </div>

      {showForm && (
        <div className="need-form">
          <PostNeedForm
            initialTitle={prefillTitle}
            onPosted={handlePosted}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}
      {posted && (
        <div className="alert alert-success" role="status">
          Posted "{posted.title}". Neighbours with a {posted.category} item will see it. Offers show up here.
        </div>
      )}

      <div className="filter-tabs" role="group" aria-label="Which needs">
        <button type="button" aria-pressed={tab === 'board'} onClick={() => setTab('board')}>Neighbours' needs ({neighbours.length})</button>
        <button type="button" aria-pressed={tab === 'mine'} onClick={() => setTab('mine')}>My needs ({mine.length})</button>
      </div>

      {loading && <Loading label="Loading needs…" />}
      {!loading && error && <ErrorMessage error={error} onRetry={load} />}
      {!loading && !error && tab === 'board' && (
        sorted.length === 0 ? (
          <EmptyState title="No one needs anything right now">Check back later, or post your own need.</EmptyState>
        ) : (
          <div className="stack">
            {sorted.map((n) => (
              <NeighbourNeed
                key={n.id}
                need={n}
                myItems={myItems}
                onOffered={(id) => setBoard((list) => list.map((x) => (x.id === id ? { ...x, offered_by_me: true, offer_count: x.offer_count + 1 } : x)))}
              />
            ))}
          </div>
        )
      )}
      {!loading && !error && tab === 'mine' && (
        mine.length === 0 ? (
          <EmptyState title="You haven't posted any needs">
            <button type="button" className="btn" onClick={() => setShowForm(true)}>Post a need</button>
          </EmptyState>
        ) : (
          <div className="stack">
            {mine.map((n) => (
              <MyNeed key={n.id} need={n} onClosed={(id) => setMine((list) => list.map((x) => (x.id === id ? { ...x, status: 'closed' } : x)))} />
            ))}
          </div>
        )
      )}
    </div>
  )
}
