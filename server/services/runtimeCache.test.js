import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearRuntimeFlightsForTests,
  singleFlight,
  TtlLruCache,
} from './runtimeCache.js'

test('coalesces concurrent cache misses into one upstream request', async () => {
  clearRuntimeFlightsForTests()
  let calls = 0
  const requests = Array.from({ length: 25 }, () => singleFlight('same-scan', async () => {
    calls += 1
    await new Promise((resolve) => setTimeout(resolve, 20))
    return { places: 962 }
  }))
  const results = await Promise.all(requests)

  assert.equal(calls, 1)
  assert.ok(results.every((result) => result.places === 962))
})

test('bounds memory and evicts the least-recently-used cache entry', () => {
  const cache = new TtlLruCache(2)
  const expiresAt = Date.now() + 60_000
  cache.set('one', { value: 1, expiresAt })
  cache.set('two', { value: 2, expiresAt })
  cache.get('one')
  cache.set('three', { value: 3, expiresAt })

  assert.equal(cache.get('two'), null)
  assert.equal(cache.get('one').value, 1)
  assert.equal(cache.get('three').value, 3)
  assert.equal(cache.size, 2)
})
