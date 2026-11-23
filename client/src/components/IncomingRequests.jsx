import { useState } from 'react'
import { api } from '../api.js'
import { notifyRequestsChanged } from '../hooks/usePendingCount.js'
import { formatDate, formatDateTime, formatRange, isOverdue } from '../utils/format.js'
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
  not_returned: [{ action: 'returned', label: 'It came back: mark returned', className: 'btn btn-small' }],
}

const OVERDUE_ACTIONS = [
  ...ACTIONS.borrowed,
  { action: 'not-returned', label: 'Report not returned', className: 'btn btn-small btn-danger-ghost' },
]

const CONFIRM = {
  reject: (r) => `Reject ${r.borrower_name}'s request?`,
  'not-returned': (r) =>
    `Report that ${r.borrower_name} has not returned this item?\n\n` +
    `They will be blocked from borrowing until you mark it returned, other owners will see a warning, ` +
    `and this item will be marked unavailable.`,
}

const ACTIVE = ['pending', 'approved', 'borrowed', 'not_returned']

function RequestRow({ request, onUpdated }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const overdue = isOverdue(request)
  const actions = overdue ? OVERDUE_ACTIONS : ACTIONS[request.status]

  async function run(action) {
    if (CONFIRM[action] && !window.confirm(CONFIRM[action](request))) return
    setBusy(action)
    setError(null)
    try {
      const data = await api(`/api/requests/${request.id}/${action}`, { method: 'PATCH' })
      onUpdated(data.request)
      notifyRequestsChanged()
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
        <StatusBadge status={request.status} request={request} />
        {actions && (
          <div className="request-row-actions">
            {actions.map(({ action, label, className }) => (
              <button key={action} type="button" className={className} disabled={Boolean(busy)} onClick={() => run(action)}>
                {busy === action ? 'Saving…' : label}
              </button>
            ))}
          </div>
        )}
      </div>
      {request.status === 'pending' && request.borrower_unreturned > 0 && (
        <p className="request-warning small">
          ⚠ {request.borrower_name} has {request.borrower_unreturned} overdue or unreturned item{request.borrower_unreturned === 1 ? '' : 's'}.
          You can't approve until they return {request.borrower_unreturned === 1 ? 'it' : 'them'}.
        </p>
      )}
      {overdue && (
        <p className="request-warning small">
          ⚠ Overdue since {formatDate(request.end_date)}. {request.borrower_name} can't borrow anything else until you mark it returned.
        </p>
      )}
      {error && <div className="request-row-error"><ErrorMessage error={error} /></div>}
    </div>
  )
}

export default function IncomingRequests({ requests, onUpdated }) {
  if (requests.length === 0) {
    return <p className="muted small request-list-note">No requests yet.</p>
  }
  const active = requests.filter((r) => ACTIVE.includes(r.status))
  const past = requests.filter((r) => !ACTIVE.includes(r.status))

  return (
    <div className="request-list">
      <p className="request-list-title">Requests</p>
      {active.length === 0 && <p className="muted small request-list-note">No open requests.</p>}
      {active.map((r) => <RequestRow key={r.id} request={r} onUpdated={onUpdated} />)}
      {past.length > 0 && (
        <details>
          <summary className="muted small">Past requests ({past.length})</summary>
          <div className="stack past-requests">
            {past.map((r) => <RequestRow key={r.id} request={r} onUpdated={onUpdated} />)}
          </div>
        </details>
      )}
    </div>
  )
}
