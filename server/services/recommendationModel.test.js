import test from 'node:test'
import assert from 'node:assert/strict'
import {
  evidenceTier,
  haversineDistanceKm,
  predictionRange,
  recommendationDecision,
  spatialSupplyWeight,
} from './recommendationModel.js'

test('weights a nearby competitor more strongly than one near the scan edge', () => {
  const center = { lat: 3.139, lng: 101.6869 }
  const nearby = spatialSupplyWeight({ lat: 3.14, lng: 101.687 }, { center, radiusKm: 5 })
  const distant = spatialSupplyWeight({ lat: 3.17, lng: 101.71 }, { center, radiusKm: 5 })

  assert.ok(haversineDistanceKm(center, { lat: 3.14, lng: 101.687 }) < 1)
  assert.ok(nearby.equivalent > distant.equivalent)
})

test('widens planning ranges when public evidence is weak and no outcomes exist', () => {
  const weak = predictionRange({
    demand: 1_000_000,
    adjustedSupply: 4,
    marketEvidence: { score: 20 },
    historicallyValidated: false,
  })
  const stronger = predictionRange({
    demand: 1_000_000,
    adjustedSupply: 4,
    marketEvidence: { score: 90 },
    historicallyValidated: true,
    spatialPopulationIsEstimated: false,
  })

  assert.ok(weak.relativeUncertainty > stronger.relativeUncertainty)
  assert.ok(weak.fairShareHighRm - weak.fairShareLowRm > stronger.fairShareHighRm - stronger.fairShareLowRm)
})

test('does not invent a validated evidence tier', () => {
  assert.equal(evidenceTier({
    validation: { status: 'not-validated' },
    marketEvidence: { level: 'high' },
    directCount: 5,
  }).level, 'public-evidence')

})

test('abstains when supply evidence is unavailable or a niche has no adequate evidence', () => {
  assert.equal(recommendationDecision({
    supplyAvailable: false,
    marketEvidence: { score: 0, level: 'low' },
    directCount: 0,
  }).status, 'insufficient-evidence')

  assert.equal(recommendationDecision({
    supplyAvailable: true,
    marketEvidence: { score: 55, level: 'medium' },
    directCount: 0,
  }).status, 'insufficient-category-evidence')
})
