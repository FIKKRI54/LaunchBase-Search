import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOverpassMarketQuery,
  marketScanScopesForRadius,
  normalizeMarketPlaces,
  requestOverpass,
} from './openMarket.js'

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

test('builds a smaller recommendation-focused retry query for dense areas', () => {
  const query = buildOverpassMarketQuery({ lat: 3.1466, lng: 101.7114, radius: 5000, scope: 'focused' })

  assert.match(query, /\["shop"\]/)
  assert.match(query, /\["craft"\]/)
  assert.match(query, /\["healthcare"\]/)
  assert.match(query, /\["office"="coworking"\]/)
  assert.doesNotMatch(query, /\["tourism"~/)
  assert.doesNotMatch(query, /\["office"\]\["office"!~/)
})

test('uses a bounded node-first marker query for a wide dense-city scan', () => {
  const query = buildOverpassMarketQuery({ lat: 3.139, lng: 101.6869, radius: 8000, scope: 'markers' })

  assert.deepEqual(marketScanScopesForRadius(8000), ['markers'])
  assert.match(query, /\[maxsize:268435456\]/)
  assert.match(query, /node\(around:8000,3\.139,101\.6869\)\["shop"\]/)
  assert.doesNotMatch(query, /nwr\(around:/)
  assert.doesNotMatch(query, /\["tourism"~/)
})

test('moves to the next Overpass endpoint after a transient provider failure', async () => {
  const calls = []
  const result = await requestOverpass('[out:json];node(1);out;', {
    endpoints: ['https://first.example/api', 'https://second.example/api'],
    totalBudgetMs: 5000,
    perRequestTimeoutMs: 1000,
    fetchImpl: async (endpoint) => {
      calls.push(endpoint)
      if (endpoint.includes('first')) return { ok: false, status: 504 }
      return {
        ok: true,
        json: async () => ({ elements: [{ type: 'node', id: 1, lat: 3.1, lon: 101.6, tags: { shop: 'bakery' } }] }),
      }
    },
  })

  assert.deepEqual(calls, ['https://first.example/api', 'https://second.example/api'])
  assert.equal(result.endpoint, 'https://second.example/api')
  assert.equal(result.body.elements.length, 1)
})

test('serializes simultaneous requests sent to the same public endpoint', async () => {
  let active = 0
  let maximumActive = 0
  const fetchImpl = async () => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 20))
    active -= 1
    return {
      ok: true,
      json: async () => ({
        elements: [{ type: 'node', id: Date.now(), lat: 3.1, lon: 101.6, tags: { shop: 'bakery' } }],
      }),
    }
  }

  await Promise.all([
    requestOverpass('[out:json];node(1);out;', {
      endpoints: ['https://same.example/api'],
      totalBudgetMs: 2000,
      perRequestTimeoutMs: 1000,
      fetchImpl,
    }),
    requestOverpass('[out:json];node(2);out;', {
      endpoints: ['https://same.example/api'],
      totalBudgetMs: 2000,
      perRequestTimeoutMs: 1000,
      fetchImpl,
    }),
  ])

  assert.equal(maximumActive, 1)
})

test('allows separate public providers to serve different scans concurrently', async () => {
  let active = 0
  let maximumActive = 0
  const fetchImpl = async () => {
    active += 1
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 20))
    active -= 1
    return {
      ok: true,
      json: async () => ({
        elements: [{ type: 'node', id: Date.now(), lat: 3.1, lon: 101.6, tags: { shop: 'bakery' } }],
      }),
    }
  }

  await Promise.all([
    requestOverpass('[out:json];node(1);out;', {
      endpoints: ['https://first-provider.example/api'],
      totalBudgetMs: 2000,
      perRequestTimeoutMs: 1000,
      fetchImpl,
    }),
    requestOverpass('[out:json];node(2);out;', {
      endpoints: ['https://second-provider.example/api'],
      totalBudgetMs: 2000,
      perRequestTimeoutMs: 1000,
      fetchImpl,
    }),
  ])

  assert.equal(maximumActive, 2)
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
