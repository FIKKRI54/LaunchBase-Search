export const GOOGLE_MAP_MODES = Object.freeze(['google', 'satellite', 'streetview'])
export const MAP_MODES = Object.freeze(['market', ...GOOGLE_MAP_MODES])

export function isGoogleMapMode(mode) {
  return GOOGLE_MAP_MODES.includes(mode)
}

export function googleEmbedUrl({ key, mode, address, lat, lng, locale }) {
  const coordinates = `${lat},${lng}`
  const params = new URLSearchParams({
    key,
    region: 'MY',
    language: locale === 'ms' ? 'ms' : 'en',
  })
  let embedMode = 'place'
  if (mode === 'google') params.set('q', address)
  if (mode === 'satellite') {
    embedMode = 'view'
    params.set('center', coordinates)
    params.set('zoom', '14')
    params.set('maptype', 'satellite')
  }
  if (mode === 'streetview') {
    embedMode = 'streetview'
    params.set('location', coordinates)
    params.set('fov', '90')
    params.set('heading', '0')
    params.set('pitch', '0')
  }
  return `https://www.google.com/maps/embed/v1/${embedMode}?${params}`
}
