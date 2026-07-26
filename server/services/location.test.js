import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseBestLocationResult } from './location.js'

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
