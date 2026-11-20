// Browser geolocation wrapped in a promise with friendly error messages.
// Works on localhost and https:// pages only (browser rule).
export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Your browser does not support location.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const messages = {
          1: 'Location permission was denied. Allow it in your browser settings to use this.',
          2: 'Could not find your location. Please try again.',
          3: 'Finding your location took too long. Please try again.',
        }
        reject(new Error(messages[err.code] || 'Could not get your location.'))
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    )
  })
}

export function formatDistance(km) {
  if (km == null) return ''
  if (km < 1) return '< 1 km away'
  return `~${km % 1 === 0 ? km : km.toFixed(1)} km away`
}

export const RADIUS_OPTIONS = [1, 2, 5, 10, 25]
