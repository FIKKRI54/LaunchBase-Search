import test from 'node:test'
import assert from 'node:assert/strict'
import {
  intervalMetrics,
  probabilityMetrics,
  regressionMetrics,
  spatialTemporalSplits,
  validationGate,
} from './modelValidation.js'

test('calculates outcome metrics without accepting invalid rows', () => {
  const regression = regressionMetrics([
    { actual: 100, prediction: 90 },
    { actual: 200, prediction: 220 },
    { actual: null, prediction: 5 },
  ])
  assert.equal(regression.count, 2)
  assert.equal(regression.mae, 15)
  assert.equal(regression.wape, 0.1)

  const probability = probabilityMetrics([
    { actual: 1, probability: 0.8 },
    { actual: 0, probability: 0.2 },
  ])
  assert.equal(probability.count, 2)
  assert.ok(probability.brier < 0.05)

  const intervals = intervalMetrics([
    { actual: 100, lower: 80, upper: 120 },
    { actual: 150, lower: 100, upper: 140 },
  ])
  assert.equal(intervals.coverage, 0.5)
  assert.equal(intervals.meanWidth, 40)
})

test('builds separate temporal, spatial, and strict holdouts', () => {
  const rows = [
    { id: 1, district: 'A', observationMonth: '2025-01-01' },
    { id: 2, district: 'B', observationMonth: '2025-01-01' },
    { id: 3, district: 'A', observationMonth: '2026-01-01' },
    { id: 4, district: 'B', observationMonth: '2026-01-01' },
  ]
  const splits = spatialTemporalSplits(rows, {
    cutoff: '2026-01-01',
    heldOutAreas: ['B'],
  })

  assert.deepEqual(splits.temporal.test.map((row) => row.id), [3, 4])
  assert.deepEqual(splits.spatial.test.map((row) => row.id), [2, 4])
  assert.deepEqual(splits.strict.train.map((row) => row.id), [1])
  assert.deepEqual(splits.strict.test.map((row) => row.id), [4])
})

test('only passes a validation run that beats its baseline on enough holdout rows', () => {
  assert.equal(validationGate({
    model: { count: 80, wape: 0.2 },
    baseline: { count: 80, wape: 0.3 },
    interval: { coverage: 0.78 },
  }).status, 'passed')

  assert.equal(validationGate({
    model: { count: 80, wape: 0.35 },
    baseline: { count: 80, wape: 0.3 },
  }).status, 'failed')

  assert.equal(validationGate({
    model: { count: 12, wape: 0.1 },
    baseline: { count: 12, wape: 0.5 },
  }).status, 'candidate')
})
