import { useState } from 'react'
import { api } from '../api.js'
import { formatDateTime, formatRange } from '../utils/format.js'
import { ErrorMessage } from './Feedback.jsx'
import StatusBadge from './StatusBadge.jsx'

// Owner actions available for each status.
const ACTIONS = {
  pending: [
    { action: 'approve', label: 'Approve', className: 'btn btn-small' },
    { action: 'reject', label: 'Reject', className: 'btn btn-small btn-danger-ghost' },
  ],
  approved: [{ action: 'borrowed', label: 'Mark borrowed', className: 'btn btn-small' }],
  borrowed: [{ action: 'returned', label: 'Mark returned', className: 'btn btn-small' }],
}

const ACTIVE = ['pending', 'approved', 'borrowed']

function RequestRow({ request, onUpdated }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function run(action) {
    if (action === 'reject' && !window.confirm(`Reject ${request.borrower_name}'s request?`)) return
    setBusy(action)
    setError(null)
    try {
      const data = await api(`/api/requests/${request.id}/${action}`, { method: 'PATCH' })
      onUpdated(data.request)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="request-row">
        <div className="request-row-info">
          <strong>{request.borrower_name}</strong> · {formatRange(request.start_date, request.end_date)}
          {request.status === 'returned' && request.returned_at && (
            <span className="muted"> · returned {formatDateTime(request.returned_at)}</span>
          )}
        </div>
        <StatusBadge status={request.status} />
        {ACTIONS[request.status] && (
          <div className="request-row-actions">
            {ACTIONS[request.status].map(({ action, label, className }) => (
              <button key={action} type="button" className={className} disabled={Boolean(busy)} onClick={() => run(action)}>
                {busy === action ? 'Saving…' : label}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <div style={{ marginTop: '0.4rem' }}><ErrorMessage error={error} /></div>}
    </div>
  )
}

export default function IncomingRequests({ requests, onUpdated }) {
  if (requests.length === 0) {
    return <p className="muted small" style={{ margin: 0 }}>No requests yet.</p>
  }
  const active = requests.filter((r) => ACTIVE.includes(r.status))
  const past = requests.filter((r) => !ACTIVE.includes(r.status))

  return (
    <div className="request-list">
      <p className="request-list-title">Requests</p>
      {active.length === 0 && <p className="muted small" style={{ margin: 0 }}>No open requests.</p>}
      {active.map((r) => <RequestRow key={r.id} request={r} onUpdated={onUpdated} />)}
      {past.length > 0 && (
        <details>
          <summary className="muted small">Past requests ({past.length})</summary>
          <div className="stack" style={{ marginTop: '0.5rem', gap: '0.5rem' }}>
            {past.map((r) => <RequestRow key={r.id} request={r} onUpdated={onUpdated} />)}
          </div>
        </details>
      )}
    </div>
  )
}
