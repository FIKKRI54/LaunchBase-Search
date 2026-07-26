import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOverpassMarketQuery, normalizeMarketPlaces } from './openMarket.js'

test('removes duplicate map features at the same storefront but preserves separate branches', () => {
  const normalized = normalizeMarketPlaces([
    {
      type: 'node',
      id: 1,
      lat: 3.1,
      lon: 101.6,
      tags: { name: '7-Eleven', shop: 'convenience' },
    },
    {
      type: 'way',
      id: 2,
      center: { lat: 3.10005, lon: 101.60005 },
      tags: { name: '7 Eleven', shop: 'convenience' },
    },
    {
      type: 'node',
      id: 3,
      lat: 3.12,
      lon: 101.62,
      tags: { name: '7-Eleven', shop: 'convenience' },
    },
  ])

  assert.equal(normalized.length, 2)
  assert.deepEqual(normalized.map((place) => place.id), ['node/1', 'node/3'])
})

test('discovers retail, trades, offices, healthcare, accommodation, and commercial amenities', () => {
  const query = buildOverpassMarketQuery({ lat: 3.1, lng: 101.6, radius: 5000 })

  assert.match(query, /\["shop"\]/)
  assert.match(query, /\["craft"\]/)
  assert.match(query, /\["office"\]/)
  assert.match(query, /\["healthcare"\]/)
  assert.match(query, /\["tourism"~/)
  assert.match(query, /\["amenity"~/)
  assert.doesNotMatch(query, /amenity"="school/)
})

test('normalizes a hostile 6,000-feature market response without quadratic slowdown', { timeout: 5000 }, () => {
  const elements = Array.from({ length: 6000 }, (_, index) => ({
    type: 'node',
    id: index + 1,
    lat: 3 + index * 0.000001,
    lon: 101 + index * 0.000001,
    tags: {
      name: `Independent business ${index}`,
      shop: index % 2 ? 'convenience' : 'bakery',
    },
  }))
  const startedAt = performance.now()
  const normalized = normalizeMarketPlaces(elements)
  const elapsedMs = performance.now() - startedAt

  assert.equal(normalized.length, elements.length)
  assert.ok(elapsedMs < 2500, `normalization took ${Math.round(elapsedMs)}ms`)
})
