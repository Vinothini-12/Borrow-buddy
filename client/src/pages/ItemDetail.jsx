import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { EmptyState, ErrorMessage, Loading } from '../components/Feedback.jsx'
import { AvailabilityPill, ItemPhoto } from '../components/ItemCard.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { dayCount, formatRange, todayIso } from '../utils/format.js'

function RequestForm({ item }) {
  const today = todayIso()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(null)

  function changeStart(value) {
    setStart(value)
    if (end && value && end < value) setEnd(value)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!start || !end) return setError('Choose a start and end date.')
    if (start < today) return setError('Start date must be today or later.')
    if (end < start) return setError('End date must be on or after the start date.')
    setSubmitting(true)
    try {
      const { request } = await api('/api/requests', {
        method: 'POST',
        body: { item_id: item.id, start_date: start, end_date: end },
      })
      setSent(request)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div className="card form">
        <div className="alert alert-success" role="status">
          Request sent to {item.owner_name} for {formatRange(sent.start_date, sent.end_date)}.
        </div>
        <p className="muted small">You'll see their decision on your requests page.</p>
        <div className="meta-row">
          <Link to="/my-requests" className="btn">View my requests</Link>
          <button type="button" className="btn btn-ghost" onClick={() => { setSent(null); setStart(''); setEnd('') }}>
            Request other dates
          </button>
        </div>
      </div>
    )
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <h2>Request to borrow</h2>
      <p className="muted small">Borrowing is free. Pick the dates you need it.</p>
      <ErrorMessage error={error} />
      <div className="field-row">
        <label className="field">
          <span>Start date</span>
          <input type="date" required min={today} value={start} onChange={(e) => changeStart(e.target.value)} />
        </label>
        <label className="field">
          <span>End date</span>
          <input type="date" required min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
      </div>
      {start && end && end >= start && (
        <p className="muted small">{dayCount(start, end)} day{dayCount(start, end) === 1 ? '' : 's'}: {formatRange(start, end)}</p>
      )}
      <button type="submit" className="btn btn-block" disabled={submitting}>
        {submitting ? 'Sending…' : 'Request to borrow'}
      </button>
    </form>
  )
}

export default function ItemDetail() {
  const { id } = useParams()
  const { user, checking } = useAuth()
  const location = useLocation()
  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api(`/api/items/${id}`)
      setItem(data.item)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) return <Loading label="Loading item…" />
  if (error?.status === 404 || error?.status === 400) {
    return (
      <div className="container section">
        <EmptyState title="This item doesn't exist or was removed">
          <Link to="/" className="btn">Browse items</Link>
        </EmptyState>
      </div>
    )
  }
  if (error) return <div className="container section"><ErrorMessage error={error} onRetry={load} /></div>

  const isOwner = user && user.id === item.owner_id
  const available = item.availability_status === 'available'

  let action
  if (checking) action = null
  else if (isOwner) {
    action = (
      <div className="card form">
        <p>This is your item. Manage requests for it on <Link to="/my-items">My Items</Link>.</p>
      </div>
    )
  } else if (!available) {
    action = (
      <div className="card form">
        <p className="muted">The owner has marked this item unavailable, so it can't be requested right now.</p>
      </div>
    )
  } else if (!user) {
    action = (
      <div className="card form">
        <h2>Want to borrow this?</h2>
        <p className="muted small">Log in to send a request to {item.owner_name}.</p>
        <Link to="/login" state={{ from: location.pathname }} className="btn btn-block">Log in to request</Link>
      </div>
    )
  } else action = <RequestForm item={item} />

  return (
    <div className="container section">
      <Link to="/" className="back-link">← Back to all items</Link>
      <div className="detail">
        <ItemPhoto item={item} lazy={false} />
        <div className="detail-info">
          <div className="meta-row">
            <span className="category">{item.category}</span>
            <AvailabilityPill status={item.availability_status} />
          </div>
          <h1>{item.name}</h1>
          <p className="muted">Lent by <strong>{item.owner_name}</strong></p>
          {item.description ? <p className="detail-desc">{item.description}</p> : <p className="muted">No description provided.</p>}
          {action}
        </div>
      </div>
    </div>
  )
}
