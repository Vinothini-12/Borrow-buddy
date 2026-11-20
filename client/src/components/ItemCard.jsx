import { Link } from 'react-router-dom'
import { imageSrc } from '../api.js'

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

export default function ItemCard({ item }) {
  return (
    <Link to={`/items/${item.id}`} className="card item-card">
      <ItemPhoto item={item} />
      <div className="item-card-body">
        <div className="item-card-top">
          <span className="category">{item.category}</span>
          <AvailabilityPill status={item.availability_status} />
        </div>
        <h3 className="item-card-title">{item.name}</h3>
        <p className="muted small">Lent by {item.owner_name}</p>
      </div>
    </Link>
  )
}
