import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chooseBestLocationResult,
  isMalaysianLocationResult,
  MalaysiaLocationError,
} from './location.js'

test('prefers the requested neighbourhood over a broader city result', () => {
  const result = chooseBestLocationResult([
    {
      name: 'Shah Alam',
      display_name: 'Shah Alam, Petaling, Selangor, Malaysia',
    },
    {
      name: 'Seksyen 17',
      display_name: 'Seksyen 17, Shah Alam, Petaling, Selangor, Malaysia',
    },
  ], 'Section 17 Shah Alam')

  assert.equal(result.name, 'Seksyen 17')
})

test('accepts only geocoder results explicitly located in Malaysia', () => {
  assert.equal(isMalaysianLocationResult({ address: { country_code: 'my' } }), true)
  assert.equal(isMalaysianLocationResult({ address: { country_code: 'sg' } }), false)
  assert.equal(isMalaysianLocationResult({ display_name: 'Malaysia-themed shop, London' }), false)
  assert.equal(new MalaysiaLocationError().statusCode, 400)
  assert.equal(new MalaysiaLocationError().code, 'MALAYSIA_ONLY')
})
