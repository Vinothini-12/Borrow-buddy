import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { EmptyState, ErrorMessage, Loading } from '../components/Feedback.jsx'
import { ItemPhoto } from '../components/ItemCard.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import { formatDate, formatDateTime, formatRange } from '../utils/format.js'

const FILTERS = ['all', 'pending', 'approved', 'borrowed', 'returned', 'rejected']

const HINTS = {
  pending: 'Waiting for the owner to respond.',
  approved: 'Approved! Arrange the handover with the owner.',
  borrowed: 'You have this item. Return it by the end date.',
  rejected: 'The owner declined this request.',
}

export default function MyRequests() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api('/api/requests/mine')
      setRequests(data.requests)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const counts = requests.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {})
  const shown = filter === 'all' ? requests : requests.filter((r) => r.status === filter)

  return (
    <div className="container section">
      <h1>My Requests</h1>
      <p className="muted">Items you've asked to borrow.</p>

      {loading && <Loading label="Loading your requests…" />}
      {!loading && error && <ErrorMessage error={error} onRetry={load} />}
      {!loading && !error && requests.length === 0 && (
        <EmptyState title="You haven't requested anything yet">
          <Link to="/" className="btn">Browse items</Link>
        </EmptyState>
      )}
      {!loading && !error && requests.length > 0 && (
        <>
          <div className="filter-tabs" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => {
              const n = f === 'all' ? requests.length : counts[f] || 0
              return (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)} ({n})
                </button>
              )
            })}
          </div>
          {shown.length === 0 ? (
            <EmptyState title={`No ${filter} requests`} />
          ) : (
            <div className="stack">
              {shown.map((r) => (
                <article key={r.id} className="card request-card">
                  <ItemPhoto item={{ name: r.item_name, image_url: r.item_image_url }} className="thumb" lazy={false} />
                  <div className="request-card-info">
                    <div className="meta-row">
                      <Link to={`/items/${r.item_id}`} className="my-item-title">{r.item_name}</Link>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="small request-card-line">
                      {formatRange(r.start_date, r.end_date)} · from {r.owner_name}
                    </p>
                    <p className="muted small request-card-line">
                      {r.status === 'returned'
                        ? `Returned ${formatDateTime(r.returned_at)}.`
                        : HINTS[r.status]}{' '}
                      Requested {formatDate(r.created_at)}.
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
