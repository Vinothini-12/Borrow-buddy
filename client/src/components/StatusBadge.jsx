import { isOverdue, statusLabel } from '../utils/format.js'

// Pass the whole request so a late "borrowed" shows as Overdue.
export default function StatusBadge({ status, request }) {
  if (request && isOverdue(request)) return <span className="badge badge-overdue">Overdue</span>
  return <span className={`badge badge-${status}`}>{statusLabel(status)}</span>
}
