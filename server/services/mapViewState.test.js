import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  GOOGLE_MAP_MODES,
  MAP_MODES,
  googleEmbedUrl,
  isGoogleMapMode,
} from '../../src/mapViewState.js'

test('rapid map-tab switching remains bounded to one Leaflet and one Google context', () => {
  let pendingGoogleMode = null
  for (let index = 0; index < 100_000; index += 1) {
    const mode = MAP_MODES[index % MAP_MODES.length]
    if (isGoogleMapMode(mode)) pendingGoogleMode = mode
  }
  assert.equal(pendingGoogleMode, 'streetview')
  assert.equal(1 + Number(Boolean(pendingGoogleMode)), 2)
})

test('only supported Google modes can schedule an embed navigation', () => {
  assert.equal(isGoogleMapMode('google'), true)
  assert.equal(isGoogleMapMode('satellite'), true)
  assert.equal(isGoogleMapMode('streetview'), true)
  assert.equal(isGoogleMapMode('market'), false)
  assert.equal(isGoogleMapMode('unsupported-provider'), false)
})

test('embed URLs remain mode-specific and safely encode Malaysian addresses', () => {
  const shared = {
    key: 'test-key',
    address: 'Bukit Bintang & KLCC, Kuala Lumpur, Malaysia',
    lat: 3.1466,
    lng: 101.6958,
    locale: 'ms',
  }
  const urls = Object.fromEntries(GOOGLE_MAP_MODES.map((mode) => [mode, new URL(googleEmbedUrl({ ...shared, mode }))]))

  assert.equal(urls.google.pathname, '/maps/embed/v1/place')
  assert.equal(urls.google.searchParams.get('q'), shared.address)
  assert.equal(urls.satellite.pathname, '/maps/embed/v1/view')
  assert.equal(urls.satellite.searchParams.get('maptype'), 'satellite')
  assert.equal(urls.streetview.pathname, '/maps/embed/v1/streetview')
  assert.equal(urls.streetview.searchParams.get('location'), `${shared.lat},${shared.lng}`)
  for (const url of Object.values(urls)) {
    assert.equal(url.searchParams.get('region'), 'MY')
    assert.equal(url.searchParams.get('language'), 'ms')
  }
})

test('authentication UI and API routes cannot regress into the product', async () => {
  const [clientSource, serverSource] = await Promise.all([
    readFile(new URL('../../src/main.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.js', import.meta.url), 'utf8'),
  ])
  const combined = `${clientSource}\n${serverSource}`
  assert.doesNotMatch(combined, /\/api\/auth|launchbase-token|AuthModal|openAuth|optionalAuth/)
  assert.doesNotMatch(clientSource, /t\(['"]login['"]\)/)
  assert.equal((clientSource.match(/<GoogleEmbedView /g) || []).length, 1)
  assert.doesNotMatch(clientSource, /key=\{embedUrl\}/)
})
