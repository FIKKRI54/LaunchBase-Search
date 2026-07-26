import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAnalysis, buildDetailedReport, evaluateCulturalFit } from './analysis.js'

const input = {
  location: { name: 'Test Town', district: 'Test', state: 'Test', lat: 3, lng: 101 },
  statistics: {
    population: 30000,
    workingAgeShare: 0.65,
    incomeMedian: 7000,
    incomeMean: 8000,
    expenditureMean: 4500,
    poverty: 2,
    populationYear: 2025,
    hiesYear: 2024,
    warnings: [],
    sources: [],
  },
  market: {
    provider: 'openstreetmap-overpass',
    cacheStatus: 'database-hit',
    fetchedAt: '2026-07-25T00:00:00.000Z',
    places: [
      { id: 'node/1', name: 'Shop 1', marketType: 'ice_cream', marketTypeLabel: 'Ice cream shop', tags: { shop: 'ice_cream' } },
      { id: 'node/2', name: 'Shop 2', marketType: 'ice_cream', marketTypeLabel: 'Ice cream shop', tags: { cuisine: 'ice_cream' } },
      { id: 'node/3', name: 'Shop 3', marketType: 'ice_cream', marketTypeLabel: 'Ice cream shop', tags: { shop: 'ice_cream' } },
    ],
  },
  benchmarks: [{
    slug: 'ice_cream',
    name: 'Ice cream shop',
    googlePlaceType: 'ice_cream_shop',
    perCapitaSpendRm: 65,
    averageStoreSalesRm: 400000,
    incomeElasticity: 0.5,
    captureRate: 1,
    estimatedStoresPer100k: 10,
    osmTags: ['shop=ice_cream', 'cuisine=ice_cream'],
    classifierTypes: ['ice_cream'],
  }],
  radiusKm: 12,
}

test('calculates demand, supportable stores, and fair share transparently', () => {
  const result = buildAnalysis(input)
  const opportunity = result.opportunities[0]
  const demographicFactor = 0.8 + 0.65 * 0.35
  const expectedDemand = Math.round(30000 * 65 * demographicFactor)

  assert.equal(result.area.population, 30000)
  assert.equal(opportunity.potentialDemandRm, expectedDemand)
  assert.equal(opportunity.competitorCount, 3)
  assert.equal(opportunity.observedCompetitors, 3)
  assert.equal(opportunity.fairShareSalesRm, Math.round(expectedDemand / 4))
  assert.equal(opportunity.supportableStores, Number((expectedDemand / 400000).toFixed(1)))
})

test('free detailed report adds sensitivity and validation steps without changing the analysis', () => {
  const free = buildAnalysis(input)
  const detailed = buildDetailedReport(free)
  assert.equal(detailed.sensitivity.length, 3)
  assert.equal(detailed.competitorValidation.length, 1)
  assert.equal(detailed.nextSteps.length, 3)
  assert.equal(detailed.opportunities[0].potentialDemandRm, free.opportunities[0].potentialDemandRm)
})

test('keeps full market counts while bounding the interactive-map payload', () => {
  const places = Array.from({ length: 3000 }, (_, index) => ({
    id: `node/${index}`,
    name: `Mapped business ${index}`,
    lat: 3 + index * 0.000001,
    lng: 101 + index * 0.000001,
    marketType: index % 20 === 0 ? 'ice_cream' : 'convenience',
    marketTypeLabel: index % 20 === 0 ? 'Ice cream shop' : 'Convenience store',
    marketFacets: [],
    specificity: 'specific',
    tags: { shop: index % 20 === 0 ? 'ice_cream' : 'convenience' },
  }))
  const result = buildAnalysis({
    ...input,
    market: { ...input.market, places },
  })

  assert.equal(result.dataQuality.mappedBusinesses, 3000)
  assert.equal(result.dataQuality.classifiedBusinesses, 3000)
  assert.ok(result.mapBusinesses.length <= 1000)
  assert.ok(result.mapBusinesses.some((place) => place.type === 'ice_cream'))
  assert.ok(result.mapBusinesses.some((place) => place.type === 'convenience'))
})

test('does not treat zero mapped competitors as proven zero supply', () => {
  const result = buildAnalysis({
    ...input,
    market: {
      ...input.market,
      places: [],
    },
  })
  const opportunity = result.opportunities[0]

  assert.equal(opportunity.observedCompetitors, 0)
  assert.ok(opportunity.adjustedCompetitors > 0)
  assert.ok(opportunity.successScore <= 82)
  assert.notEqual(opportunity.confidence, 'high')
  assert.match(opportunity.competitorBasis, /coverage|baseline|minimum/i)
})

test('marks an upstream market failure as unavailable instead of a zero-business scan', () => {
  const result = buildAnalysis({
    ...input,
    market: {
      provider: 'modelled-fallback',
      cacheStatus: 'unavailable',
      fetchedAt: null,
      places: [],
      warning: 'OpenStreetMap request timed out',
    },
  })

  assert.equal(result.dataQuality.supplyAvailable, false)
  assert.equal(result.dataQuality.marketScanStatus, 'unavailable')
  assert.equal(result.dataQuality.mappedBusinesses, 0)
  assert.match(result.dataQuality.marketEvidence.note, /unavailable/i)
  assert.ok(result.opportunities[0].adjustedCompetitors > 0)
})

test('distinguishes a successful empty map response from an unavailable scan', () => {
  const result = buildAnalysis({
    ...input,
    market: {
      provider: 'openstreetmap-overpass',
      cacheStatus: 'database-refreshed',
      fetchedAt: '2026-07-26T00:00:00.000Z',
      places: [],
    },
  })

  assert.equal(result.dataQuality.supplyAvailable, true)
  assert.equal(result.dataQuality.marketScanStatus, 'complete-empty')
})

test('penalizes thin mapped evidence instead of issuing a near-certain recommendation', () => {
  const result = buildAnalysis({
    ...input,
    statistics: {
      ...input.statistics,
      population: 300000,
    },
    market: {
      ...input.market,
      places: [{
        id: 'node/1',
        name: 'Only mapped place',
        marketType: 'other_business',
        marketTypeLabel: 'Other business',
        classificationConfidence: 'low',
        tags: { shop: 'yes' },
      }],
    },
  })
  const opportunity = result.opportunities[0]

  assert.equal(result.dataQuality.marketEvidence.level, 'low')
  assert.ok(result.dataQuality.marketEvidence.coverageFactor < 0.5)
  assert.ok(opportunity.successScore < 70)
  assert.ok(opportunity.scoreExplanation.length >= 2)
})

test('uses live observations but keeps a conservative unseen-supply allowance', () => {
  const result = buildAnalysis(input)
  const opportunity = result.opportunities[0]

  assert.equal(opportunity.observedCompetitors, 3)
  assert.ok(opportunity.adjustedCompetitors >= opportunity.observedCompetitors)
  assert.ok(opportunity.adjustedCompetitors <= opportunity.observedCompetitors + opportunity.estimatedCompetitors)
  assert.ok(opportunity.scoreSignals.evidence <= 100)
})

test('ranks an otherwise identical heavily supplied category below a market gap', () => {
  const genericPlaces = Array.from({ length: 100 }, (_, index) => ({
    id: `node/generic-${index}`,
    name: `Mapped business ${index}`,
    marketType: 'other_business',
    marketTypeLabel: 'Other business',
    classificationConfidence: 'low',
    tags: { shop: 'yes' },
  }))
  const gap = buildAnalysis({
    ...input,
    market: { ...input.market, places: genericPlaces },
  }).opportunities[0]
  const saturated = buildAnalysis({
    ...input,
    market: {
      ...input.market,
      places: [
        ...genericPlaces,
        ...Array.from({ length: 20 }, (_, index) => ({
          id: `node/ice-${index}`,
          name: `Ice cream ${index}`,
          marketType: 'ice_cream',
          marketTypeLabel: 'Ice cream shop',
          classificationConfidence: 'high',
          tags: { shop: 'ice_cream' },
        })),
      ],
    },
  }).opportunities[0]

  assert.ok(saturated.successScore < gap.successScore)
  assert.ok(saturated.fairShareSalesRm < gap.fairShareSalesRm)
})

test('does not label a single niche match as medium or high confidence', () => {
  const places = [
    ...Array.from({ length: 100 }, (_, index) => ({
      id: `node/generic-${index}`,
      name: `Mapped business ${index}`,
      marketType: 'other_business',
      marketTypeLabel: 'Other business',
      classificationConfidence: 'low',
      tags: { shop: 'yes' },
    })),
    {
      id: 'node/ice-1',
      name: 'Only mapped ice cream shop',
      marketType: 'ice_cream',
      marketTypeLabel: 'Ice cream shop',
      classificationConfidence: 'high',
      tags: { shop: 'ice_cream' },
    },
  ]
  const opportunity = buildAnalysis({
    ...input,
    market: { ...input.market, places },
  }).opportunities[0]

  assert.equal(opportunity.confidence, 'low')
  assert.match(opportunity.riskFlags[0], /Only 1 directly mapped competitor/)
})

test('uses category-specific age profiles instead of one generic demographic factor', () => {
  const benchmark = {
    ...input.benchmarks[0],
    marketProfile: {
      audience: {
        children: { baseline: 0.22, weight: 0.8, label: 'children and family demand' },
      },
    },
  }
  const childHeavy = buildAnalysis({
    ...input,
    benchmarks: [benchmark],
    statistics: {
      ...input.statistics,
      ageShares: { children: 0.36, youngAdults: 0.25, workingAge: 0.65, seniors: 0.08 },
    },
  }).opportunities[0]
  const childLight = buildAnalysis({
    ...input,
    benchmarks: [benchmark],
    statistics: {
      ...input.statistics,
      ageShares: { children: 0.12, youngAdults: 0.25, workingAge: 0.65, seniors: 0.22 },
    },
  }).opportunities[0]

  assert.ok(childHeavy.potentialDemandRm > childLight.potentialDemandRm)
  assert.ok(childHeavy.demandFactors.audience > childLight.demandFactors.audience)
  assert.match(childHeavy.demographicSignals[0], /children and family demand/)
})

test('uses ethnicity only as a modest cuisine-affinity signal', () => {
  const benchmark = {
    ...input.benchmarks[0],
    slug: 'chinese_restaurant',
    marketProfile: {
      culturalAffinity: {
        ethnicities: ['chinese'],
        baseline: 0.23,
        weight: 0.25,
        label: 'Chinese cuisine affinity',
      },
    },
  }
  const higherAffinity = buildAnalysis({
    ...input,
    benchmarks: [benchmark],
    statistics: {
      ...input.statistics,
      ethnicityShares: { chinese: 0.45 },
    },
  }).opportunities[0]
  const lowerAffinity = buildAnalysis({
    ...input,
    benchmarks: [benchmark],
    statistics: {
      ...input.statistics,
      ethnicityShares: { chinese: 0.08 },
    },
  }).opportunities[0]

  assert.ok(higherAffinity.demandFactors.cultural > lowerAffinity.demandFactors.cultural)
  assert.ok(higherAffinity.demandFactors.cultural <= 1.15)
  assert.ok(lowerAffinity.demandFactors.cultural >= 0.85)
})

test('does not infer religion from ethnicity for pork or non-halal concepts', () => {
  const benchmark = {
    slug: 'pork_barbecue',
    marketProfile: {
      restrictedProducts: ['pork'],
    },
  }
  const fit = evaluateCulturalFit({
    benchmark,
    statistics: {
      ethnicityShares: { bumiMalay: 0.9, chinese: 0.05 },
    },
    market: { places: [] },
  })

  assert.equal(fit.eligibleForRecommendation, false)
  assert.equal(fit.status, 'insufficient-religion-or-market-evidence')
  assert.match(fit.warning, /Ethnicity is not used as a religion proxy/)
})

test('automatically detects a restricted product from a new benchmark name', () => {
  const fit = evaluateCulturalFit({
    benchmark: { slug: 'smoked_pig_barbecue', name: 'Smoked pig BBQ house' },
    statistics: { ethnicityShares: { bumiMalay: 0.7, chinese: 0.2 } },
    market: { places: [] },
  })

  assert.equal(fit.eligibleForRecommendation, false)
  assert.equal(fit.status, 'insufficient-religion-or-market-evidence')
})

test('blocks a pork concept when explicit aggregate religion evidence shows poor fit', () => {
  const fit = evaluateCulturalFit({
    benchmark: {
      slug: 'pork_barbecue',
      marketProfile: { restrictedProducts: ['pork'] },
    },
    statistics: {
      religionShares: { muslim: 0.82 },
      ethnicityShares: { bumiMalay: 0.6 },
    },
    market: { places: [] },
  })

  assert.equal(fit.eligibleForRecommendation, false)
  assert.equal(fit.status, 'culturally-incompatible')
  assert.ok(fit.factor <= 0.25)
})
