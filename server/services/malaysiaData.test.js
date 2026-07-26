import test from 'node:test'
import assert from 'node:assert/strict'
import { getAreaStatistics, summarizePopulation } from './malaysiaData.js'

test('summarizes official age, sex, citizenship and ethnicity rows for a district', () => {
  const base = { state: 'Test State', district: 'Profile District', date: '2025-01-01' }
  const rows = [
    { ...base, sex: 'both', age: 'overall', ethnicity: 'overall', population: '100.0' },
    { ...base, sex: 'both', age: '0-4', ethnicity: 'overall', population: '10.0' },
    { ...base, sex: 'both', age: '5-9', ethnicity: 'overall', population: '10.0' },
    { ...base, sex: 'both', age: '10-14', ethnicity: 'overall', population: '10.0' },
    { ...base, sex: 'both', age: '15-19', ethnicity: 'overall', population: '10.0' },
    { ...base, sex: 'both', age: '20-24', ethnicity: 'overall', population: '10.0' },
    { ...base, sex: 'both', age: '25-29', ethnicity: 'overall', population: '10.0' },
    { ...base, sex: 'both', age: '30-34', ethnicity: 'overall', population: '10.0' },
    { ...base, sex: 'both', age: '35-39', ethnicity: 'overall', population: '5.0' },
    { ...base, sex: 'both', age: '40-44', ethnicity: 'overall', population: '5.0' },
    { ...base, sex: 'both', age: '65-69', ethnicity: 'overall', population: '10.0' },
    { ...base, sex: 'male', age: 'overall', ethnicity: 'overall', population: '48.0' },
    { ...base, sex: 'female', age: 'overall', ethnicity: 'overall', population: '52.0' },
    { ...base, sex: 'both', age: 'overall', ethnicity: 'bumi_malay', population: '55.0' },
    { ...base, sex: 'both', age: 'overall', ethnicity: 'bumi_other', population: '5.0' },
    { ...base, sex: 'both', age: 'overall', ethnicity: 'chinese', population: '20.0' },
    { ...base, sex: 'both', age: 'overall', ethnicity: 'indian', population: '10.0' },
    { ...base, sex: 'both', age: 'overall', ethnicity: 'other_citizen', population: '2.0' },
    { ...base, sex: 'both', age: 'overall', ethnicity: 'other_noncitizen', population: '8.0' },
  ]

  const metrics = summarizePopulation(rows)[0].metrics
  assert.equal(metrics.population, 100000)
  assert.equal(metrics.ageShares.children, 0.3)
  assert.equal(metrics.ageShares.youngAdults, 0.35)
  assert.equal(metrics.ageShares.seniors, 0.1)
  assert.equal(metrics.sexShares.female, 0.52)
  assert.equal(metrics.ethnicityShares.bumiMalay, 0.55)
  assert.equal(metrics.ethnicityShares.chinese, 0.2)
  assert.equal(metrics.citizenshipShares.nonCitizen, 0.08)
})

test('fetches once and reuses synchronized data on later scans', async () => {
  const originalFetch = global.fetch
  let requestCount = 0
  global.fetch = async (url) => {
    requestCount += 1
    if (String(url).includes('population_district.csv')) {
      return new Response([
        'state,district,date,sex,age,ethnicity,population',
        'Test State,Cache District,2025-01-01,both,overall,overall,30.0',
        'Test State,Cache District,2025-01-01,both,20-24,overall,3.0',
        'Test State,Cache District,2025-01-01,both,25-29,overall,3.0',
      ].join('\n'), { status: 200 })
    }
    return new Response(JSON.stringify([{
      date: '2024-01-01',
      state: 'Test State',
      district: 'Cache District',
      income_mean: 8000,
      income_median: 7000,
      expenditure_mean: 4500,
      poverty: 2,
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const location = { district: 'Cache District', state: 'Test State' }
    const first = await getAreaStatistics(location)
    const second = await getAreaStatistics(location)

    assert.equal(first.population, 30000)
    assert.equal(first.cache.population, 'memory-seeded')
    assert.equal(second.cache.population, 'memory-hit')
    assert.equal(second.cache.household, 'memory-hit')
    assert.equal(requestCount, 2)
  } finally {
    global.fetch = originalFetch
  }
})
