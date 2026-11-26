import { Link } from 'react-router-dom'
import { imageSrc } from '../api.js'
import { formatDistance } from '../utils/geo.js'

export function ItemPhoto({ item, className = '', lazy = true }) {
  const src = imageSrc(item.image_url)
  if (src) return <img className={`item-photo ${className}`} src={src} alt={item.name} loading={lazy ? 'lazy' : 'eager'} />
  return (
    <div className={`item-photo item-photo-placeholder ${className}`} aria-hidden="true">
      {item.name.charAt(0).toUpperCase()}
    </div>
  )
}

export function AvailabilityPill({ status }) {
  return (
    <span className={`pill ${status === 'available' ? 'pill-available' : 'pill-unavailable'}`}>
      {status === 'available' ? 'Available' : 'Unavailable'}
    </span>
  )
}

const MAX_TILT = 8 // degrees

// Tilt the card toward the mouse. Writes CSS variables directly, so no re-renders.
function handleTilt(e) {
  if (e.pointerType !== 'mouse') return
  const el = e.currentTarget
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width // 0..1
  const y = (e.clientY - r.top) / r.height
  el.classList.add('is-tilting')
  el.style.setProperty('--ry', `${((x - 0.5) * 2 * MAX_TILT).toFixed(2)}deg`)
  el.style.setProperty('--rx', `${((0.5 - y) * 2 * MAX_TILT).toFixed(2)}deg`)
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
}

function resetTilt(e) {
  const el = e.currentTarget
  el.classList.remove('is-tilting')
  el.style.setProperty('--rx', '0deg')
  el.style.setProperty('--ry', '0deg')
}

export default function ItemCard({ item }) {
  return (
    <Link to={`/items/${item.id}`} className="card item-card" onPointerMove={handleTilt} onPointerLeave={resetTilt}>
      <ItemPhoto item={item} />
      <div className="item-card-body">
        <div className="item-card-top">
          <span className="category">{item.category}</span>
          <AvailabilityPill status={item.availability_status} />
        </div>
        <h3 className="item-card-title">{item.name}</h3>
        <p className="muted small">Lent by {item.owner_name}</p>
        {item.distance_km != null && <p className="distance small">📍 {formatDistance(item.distance_km)}</p>}
      </div>
    </Link>
  )
}
