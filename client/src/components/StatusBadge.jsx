const LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  borrowed: 'Borrowed',
  returned: 'Returned',
  rejected: 'Rejected',
}

export default function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{LABELS[status] || status}</span>
}
