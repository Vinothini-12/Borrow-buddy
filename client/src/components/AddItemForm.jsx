import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { CATEGORIES, IMAGE_TYPES, MAX_IMAGE_BYTES } from '../constants.js'
import { getPosition } from '../utils/geo.js'
import { ErrorMessage } from './Feedback.jsx'

const EMPTY = { name: '', description: '', category: '', availability_status: 'available' }

export default function AddItemForm({ onCreated }) {
  const [form, setForm] = useState(EMPTY)
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [location, setLocation] = useState(null)
  const [locating, setLocating] = useState(false)
  const fileInput = useRef(null)

  async function addMyLocation() {
    setError(null)
    setLocating(true)
    try {
      setLocation(await getPosition())
    } catch (err) {
      setError(err.message)
    } finally {
      setLocating(false)
    }
  }

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  function handleFile(e) {
    const chosen = e.target.files?.[0] || null
    setError(null)
    if (chosen && !IMAGE_TYPES.includes(chosen.type)) {
      setError('Photo must be a JPG, PNG or WEBP image.')
      e.target.value = ''
      return setFile(null)
    }
    if (chosen && chosen.size > MAX_IMAGE_BYTES) {
      setError('Photo must be 2 MB or smaller.')
      e.target.value = ''
      return setFile(null)
    }
    setFile(chosen)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const data = new FormData()
    Object.entries(form).forEach(([k, v]) => data.append(k, v))
    if (file) data.append('image', file)
    if (location) {
      data.append('latitude', location.lat)
      data.append('longitude', location.lng)
    }
    try {
      const { item } = await api('/api/items', { method: 'POST', form: data })
      setForm(EMPTY)
      setFile(null)
      setLocation(null)
      if (fileInput.current) fileInput.current.value = ''
      onCreated(item)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <h2>Lend an item</h2>
      <ErrorMessage error={error} />
      <label className="field">
        <span>Name</span>
        <input required maxLength={120} value={form.name} onChange={set('name')} placeholder="e.g. Power Drill" />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea rows={3} maxLength={2000} value={form.description} onChange={set('description')} placeholder="Condition, what's included, pickup notes…" />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Category</span>
          <select required value={form.category} onChange={set('category')}>
            <option value="" disabled>Choose…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Availability</span>
          <select value={form.availability_status} onChange={set('availability_status')}>
            <option value="available">Available</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Photo <small className="muted">(optional, JPG/PNG/WEBP, max 2 MB)</small></span>
        <input ref={fileInput} type="file" accept={IMAGE_TYPES.join(',')} onChange={handleFile} />
      </label>
      {preview && <img className="upload-preview" src={preview} alt="Selected photo preview" />}
      <div className="field">
        <span>Location <small className="muted">(optional, so neighbours nearby can find it)</small></span>
        {location ? (
          <div className="location-set">
            <span>📍 Location added <small className="muted">(approximate, ~1 km; never your exact address)</small></span>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setLocation(null)}>Remove</button>
          </div>
        ) : (
          <button type="button" className="btn btn-small btn-ghost" onClick={addMyLocation} disabled={locating}>
            {locating ? 'Finding location…' : '📍 Use my location'}
          </button>
        )}
      </div>
      <button type="submit" className="btn btn-block" disabled={submitting}>
        {submitting ? 'Listing…' : 'List item'}
      </button>
    </form>
  )
}
