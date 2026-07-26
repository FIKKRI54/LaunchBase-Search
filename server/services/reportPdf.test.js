import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnalysisPdf } from '../../src/reportPdf.js'

const analysis = {
  generatedAt: '2026-07-26T12:00:00.000Z',
  radiusKm: 5,
  location: { name: 'Section 17, Shah Alam' },
  area: { population: 411563, medianHouseholdIncomeRm: 10688 },
  dataQuality: {
    mappedBusinesses: 1054,
    marketEvidence: { score: 81, note: 'Strong mapped coverage with official district data.' },
  },
  opportunities: Array.from({ length: 8 }, (_, index) => ({
    name: `Test opportunity ${index + 1}`,
    successScore: 82 - index,
    scoreBand: 'Promising',
    recommendedFormat: 'A compact neighbourhood format designed around repeat local demand.',
    potentialDemandRm: 1_500_000 - index * 50_000,
    supportableStores: 4.2,
    adjustedCompetitors: 3,
    fairShareSalesRm: 375_000,
    scoreExplanation: ['Demand exceeds the cautious baseline', 'Mapped supply is moderate'],
    riskFlags: ['Validate rent and street-level footfall before investing.'],
  })),
  sensitivity: [
    { scenario: 'Conservative', demandChange: -20, topOpportunitySalesRm: 300000 },
    { scenario: 'Base', demandChange: 0, topOpportunitySalesRm: 375000 },
    { scenario: 'Optimistic', demandChange: 20, topOpportunitySalesRm: 450000 },
  ],
  competitorValidation: Array.from({ length: 8 }, (_, index) => ({
    category: `Test opportunity ${index + 1}`,
    mappedCount: 2,
    adjustedCount: 3,
    checks: ['Count relevant businesses', 'Record rating and review volume', 'Remove closed listings'],
  })),
  nextSteps: ['Validate traffic.', 'Request rental data.', 'Test site-level capture rates.'],
  methodology: {
    demand: 'Demand uses population, household conditions and a cautious category capture rate.',
    competitorEstimate: 'Supply uses classified mapped businesses with a coverage adjustment.',
    demographicFit: 'Demographic factors are category-specific and aggregate.',
    disclaimer: 'This is a planning estimate, not a guarantee.',
  },
  sources: [{ name: 'data.gov.my', url: 'https://data.gov.my/' }],
}

test('creates a multi-page PDF in memory without a backend file', async () => {
  const { pdf, fileName } = await createAnalysisPdf(analysis)
  const bytes = pdf.output('arraybuffer')

  assert.ok(bytes.byteLength > 10_000)
  assert.ok(pdf.getNumberOfPages() >= 2)
  assert.match(fileName, /^launchbase-section-17-shah-alam-\d{4}-\d{2}-\d{2}\.pdf$/)
})

test('creates the same browser-only report in Bahasa Melayu', async () => {
  const { pdf, fileName } = await createAnalysisPdf(analysis, 'ms')
  const bytes = pdf.output('arraybuffer')

  assert.ok(bytes.byteLength > 10_000)
  assert.ok(pdf.getNumberOfPages() >= 2)
  assert.match(fileName, /^launchbase-section-17-shah-alam-\d{4}-\d{2}-\d{2}\.pdf$/)
})
