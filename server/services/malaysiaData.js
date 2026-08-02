import { parse } from 'csv-parse/sync'
import * as database from '../db.js'
import { runInBackground, singleFlight, TtlLruCache } from './runtimeCache.js'
import { canonicalizeGovernmentArea as canonicalizeArea } from './governmentAreas.js'

const API_BASE = 'https://api.data.gov.my/data-catalogue'
const POPULATION_CSV = 'https://storage.dosm.gov.my/population/population_district.csv'
const POPULATION_DATASET = 'population_district'
const HIES_DATASET = 'hies_district'
const cacheDays = Math.max(1, Number(process.env.MALAYSIA_DATA_CACHE_DAYS || 30))
const cacheMs = cacheDays * 24 * 60 * 60 * 1000
const memoryCache = new TtlLruCache(process.env.STATISTICS_MEMORY_CACHE_MAX_ENTRIES || 128)
const refreshedStatus = (stored) => database.pool
  ? (stored ? 'database-refreshed' : 'database-seeded')
  : 'memory-seeded'

const fallbackData = {
  'W.P. Kuala Lumpur': { population: 2067500, workingAgeShare: 0.69, year: 2024, incomeMedian: 10234, incomeMean: 13257, expenditureMean: 7648, poverty: 0.2 },
  'Johor Bahru': { population: 1711000, workingAgeShare: 0.67, year: 2024, incomeMedian: 8977, incomeMean: 10975, expenditureMean: 6764, poverty: 1.9 },
  Petaling: { population: 2300000, workingAgeShare: 0.7, year: 2024, incomeMedian: 11123, incomeMean: 13846, expenditureMean: 7800, poverty: 0.5 },
  'Timur Laut': { population: 556000, workingAgeShare: 0.68, year: 2024, incomeMedian: 8600, incomeMean: 10400, expenditureMean: 6200, poverty: 1.2 },
  Kuching: { population: 630000, workingAgeShare: 0.66, year: 2024, incomeMedian: 7200, incomeMean: 8900, expenditureMean: 5100, poverty: 3.8 },
  'Kota Kinabalu': { population: 560000, workingAgeShare: 0.65, year: 2024, incomeMedian: 6800, incomeMean: 8200, expenditureMean: 4900, poverty: 5.0 },
}
const nationalHouseholdFallback = {
  incomeMedian: 7000,
  incomeMean: 8500,
  expenditureMean: 5000,
  poverty: 5,
  hiesYear: 2022,
}
const nationalDemographicFallback = {
  ageShares: {
    children: 0.23,
    youth: 0.16,
    youngAdults: 0.31,
    familyAge: 0.3,
    workingAge: 0.69,
    seniors: 0.08,
  },
  sexShares: { male: 0.515, female: 0.485 },
  ethnicityShares: {
    bumiMalay: 0.53,
    bumiOther: 0.11,
    chinese: 0.2,
    indian: 0.06,
    otherCitizen: 0.01,
    otherNonCitizen: 0.09,
  },
  citizenshipShares: { citizen: 0.91, nonCitizen: 0.09 },
}

export function canonicalizeGovernmentArea(location) {
  return canonicalizeArea(location)
}

async function readStoredStatistic(datasetId, district, state = '') {
  const result = await database.tryQuery(
    `SELECT state, district, data_year, metrics, source_url, last_synced_at,
      expires_at, expires_at > NOW() AS is_fresh
     FROM area_statistics
     WHERE dataset_id = $1
       AND LOWER(district) = LOWER($2)
       AND ($3 = '' OR LOWER(state) = LOWER($3))
     ORDER BY (LOWER(state) = LOWER($3)) DESC
     LIMIT 1`,
    [datasetId, district, state],
  )
  const row = result?.rows?.[0]
  if (!row) return null
  return {
    value: { ...row.metrics, year: row.data_year },
    isFresh: row.is_fresh,
    lastSyncedAt: row.last_synced_at,
    expiresAt: row.expires_at,
  }
}

async function storeStatistics(records) {
  if (!records.length) return
  await database.tryQuery(
    `INSERT INTO area_statistics
      (dataset_id, state, district, data_year, metrics, source_url, last_synced_at, expires_at)
     SELECT item.dataset_id, item.state, item.district, item.data_year,
       item.metrics, item.source_url, NOW(), NOW() + make_interval(days => $2::int)
     FROM jsonb_to_recordset($1::jsonb) AS item(
       dataset_id TEXT,
       state TEXT,
       district TEXT,
       data_year INTEGER,
       metrics JSONB,
       source_url TEXT
     )
     ON CONFLICT (dataset_id, state, district)
     DO UPDATE SET
       data_year = EXCLUDED.data_year,
       metrics = EXCLUDED.metrics,
       source_url = EXCLUDED.source_url,
       last_synced_at = NOW(),
       expires_at = NOW() + make_interval(days => $2::int)`,
    [JSON.stringify(records), cacheDays],
  )
}

function getMemory(key) {
  return memoryCache.get(key)?.value || null
}

function setMemory(key, value) {
  memoryCache.set(key, { value, expiresAt: Date.now() + cacheMs })
}

const share = (value, total) => Number((value / Math.max(total, 0.0001)).toFixed(4))

function ageStart(age) {
  const match = String(age).match(/^(\d+)/)
  return match ? Number(match[1]) : null
}

function sumPopulation(rows, predicate) {
  return rows.filter(predicate).reduce((sum, row) => sum + Number(row.population || 0), 0)
}

export function summarizePopulation(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const key = `${row.state}\u0000${row.district}`
    const group = grouped.get(key) || { state: row.state, district: row.district, rows: [] }
    group.rows.push(row)
    grouped.set(key, group)
  }

  const records = []
  for (const group of grouped.values()) {
    const latestYear = Math.max(...group.rows.map((row) => Number(row.date.slice(0, 4))))
    const latest = group.rows.filter((row) => Number(row.date.slice(0, 4)) === latestYear)
    const total = latest.find((row) =>
      row.sex === 'both' && row.age === 'overall' && row.ethnicity === 'overall',
    )
    if (!total) continue
    const totalPopulation = Number(total.population)
    const ageRows = latest.filter((row) =>
      row.sex === 'both' && row.ethnicity === 'overall' && row.age !== 'overall',
    )
    const ageTotal = (minimum, maximum) => sumPopulation(ageRows, (row) => {
      const start = ageStart(row.age)
      return start !== null && start >= minimum && start <= maximum
    })
    const sexTotal = (sex) => sumPopulation(latest, (row) =>
      row.sex === sex && row.age === 'overall' && row.ethnicity === 'overall',
    )
    const ethnicityTotal = (ethnicity) => sumPopulation(latest, (row) =>
      row.sex === 'both' && row.age === 'overall' && row.ethnicity === ethnicity,
    )
    const nonCitizen = ethnicityTotal('other_noncitizen')
    const ageShares = {
      children: share(ageTotal(0, 14), totalPopulation),
      youth: share(ageTotal(15, 24), totalPopulation),
      youngAdults: share(ageTotal(20, 39), totalPopulation),
      familyAge: share(ageTotal(25, 44), totalPopulation),
      workingAge: share(ageTotal(15, 64), totalPopulation),
      seniors: share(ageTotal(65, 200), totalPopulation),
    }
    records.push({
      dataset_id: POPULATION_DATASET,
      state: group.state,
      district: group.district,
      data_year: latestYear,
      metrics: {
        population: Math.round(totalPopulation * 1000),
        workingAgeShare: ageShares.workingAge,
        ageShares,
        sexShares: {
          male: share(sexTotal('male'), totalPopulation),
          female: share(sexTotal('female'), totalPopulation),
        },
        ethnicityShares: {
          bumiMalay: share(ethnicityTotal('bumi_malay'), totalPopulation),
          bumiOther: share(ethnicityTotal('bumi_other'), totalPopulation),
          chinese: share(ethnicityTotal('chinese'), totalPopulation),
          indian: share(ethnicityTotal('indian'), totalPopulation),
          otherCitizen: share(ethnicityTotal('other_citizen'), totalPopulation),
          otherNonCitizen: share(nonCitizen, totalPopulation),
        },
        citizenshipShares: {
          citizen: share(totalPopulation - nonCitizen, totalPopulation),
          nonCitizen: share(nonCitizen, totalPopulation),
        },
      },
      source_url: POPULATION_CSV,
    })
  }
  return records
}

async function fetchAndStorePopulationSnapshot() {
  const existing = getMemory('population-summary')
  if (existing) return existing
  return singleFlight('statistics:population-snapshot', async () => {
    const cachedDuringWait = getMemory('population-summary')
    if (cachedDuringWait) return cachedDuringWait
    const response = await fetch(POPULATION_CSV, { signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`DOSM population download failed (${response.status})`)
    const rows = parse(await response.text(), { columns: true, skip_empty_lines: true })
    const records = summarizePopulation(rows)
    await storeStatistics(records)
    setMemory('population-summary', records)
    return records
  })
}

function findPopulationRecord(records, district, state) {
  return records.find((item) =>
    item.district.toLowerCase() === district.toLowerCase()
    && (!state || item.state.toLowerCase() === state.toLowerCase()),
  ) || records.find((item) => item.district.toLowerCase() === district.toLowerCase())
}

async function getPopulation(district, state) {
  const stored = await readStoredStatistic(POPULATION_DATASET, district, state)
  const hasExpandedProfile = stored?.value?.ageShares && stored?.value?.ethnicityShares
  if (stored?.isFresh && hasExpandedProfile) return { ...stored.value, cacheStatus: 'database-hit' }

  const memoryRecords = getMemory('population-summary')
  const memoryRecord = memoryRecords && findPopulationRecord(memoryRecords, district, state)
  if (memoryRecord) return { ...memoryRecord.metrics, year: memoryRecord.data_year, cacheStatus: 'memory-hit' }

  if (stored && hasExpandedProfile) {
    runInBackground('statistics:population-refresh', fetchAndStorePopulationSnapshot)
    return {
      ...stored.value,
      cacheStatus: 'database-stale-refreshing',
      cacheWarning: 'Refreshing the official population snapshot in the background',
    }
  }

  try {
    const records = await fetchAndStorePopulationSnapshot()
    const record = findPopulationRecord(records, district, state)
    if (!record) throw new Error(`No population record for ${district}`)
    return { ...record.metrics, year: record.data_year, cacheStatus: refreshedStatus(stored) }
  } catch (error) {
    if (stored) return { ...stored.value, cacheStatus: 'database-stale', cacheWarning: error.message }
    throw error
  }
}

async function fetchHies(district, state) {
  const url = new URL(API_BASE)
  url.searchParams.set('id', HIES_DATASET)
  url.searchParams.set('ifilter', `${district}@district`)
  url.searchParams.set('sort', '-date')
  url.searchParams.set('limit', '10')
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Malaysia Open API failed (${response.status})`)
  const records = await response.json()
  const record = records.find((row) => !state || row.state.toLowerCase() === state.toLowerCase()) || records[0]
  if (!record) throw new Error(`No HIES record for ${district}`)
  return {
    dataset_id: HIES_DATASET,
    state: record.state,
    district: record.district,
    data_year: Number(record.date.slice(0, 4)),
    metrics: {
      incomeMedian: Number(record.income_median),
      incomeMean: Number(record.income_mean),
      expenditureMean: Number(record.expenditure_mean),
      poverty: Number(record.poverty),
    },
    source_url: `${API_BASE}?id=${HIES_DATASET}`,
  }
}

async function getHouseholdData(district, state) {
  const stored = await readStoredStatistic(HIES_DATASET, district, state)
  if (stored?.isFresh) return { ...stored.value, hiesYear: stored.value.year, cacheStatus: 'database-hit' }

  const memoryKey = `hies:${state}:${district}`
  const memoryValue = getMemory(memoryKey)
  if (memoryValue) return { ...memoryValue, cacheStatus: 'memory-hit' }

  if (stored) {
    runInBackground(`statistics:hies:${state}:${district}`, async () => {
      const record = await fetchHies(district, state)
      await storeStatistics([record])
      setMemory(memoryKey, { ...record.metrics, year: record.data_year, hiesYear: record.data_year })
    })
    return {
      ...stored.value,
      hiesYear: stored.value.year,
      cacheStatus: 'database-stale-refreshing',
      cacheWarning: 'Refreshing household statistics in the background',
    }
  }

  try {
    return await singleFlight(`statistics:hies:${state}:${district}`, async () => {
      const record = await fetchHies(district, state)
      await storeStatistics([record])
      const value = { ...record.metrics, year: record.data_year, hiesYear: record.data_year }
      setMemory(memoryKey, value)
      return { ...value, cacheStatus: refreshedStatus(stored) }
    })
  } catch (error) {
    if (stored) return {
      ...stored.value,
      hiesYear: stored.value.year,
      cacheStatus: 'database-stale',
      cacheWarning: error.message,
    }
    throw error
  }
}

export async function getAreaStatistics(location) {
  const governmentArea = canonicalizeGovernmentArea(location)
  const fallback = fallbackData[governmentArea.district]
  const warnings = []
  const [populationResult, householdResult] = await Promise.allSettled([
    getPopulation(governmentArea.district, governmentArea.state),
    getHouseholdData(governmentArea.district, governmentArea.state),
  ])

  let population
  if (populationResult.status === 'fulfilled') {
    population = populationResult.value
    if (population.cacheWarning) warnings.push(population.cacheWarning)
  } else {
    const error = populationResult.reason
    warnings.push(error.message)
    if (!fallback?.population) {
      throw new Error(`Official district population was not found for ${governmentArea.district}. Try a nearby city or district name.`)
    }
    population = { ...fallback, cacheStatus: 'built-in-location-fallback' }
  }

  let household
  if (householdResult.status === 'fulfilled') {
    household = householdResult.value
    if (household.cacheWarning) warnings.push(household.cacheWarning)
  } else {
    const error = householdResult.reason
    warnings.push(error.message)
    household = {
      ...nationalHouseholdFallback,
      ...(fallback || {}),
      cacheStatus: fallback ? 'built-in-location-fallback' : 'national-assumption-fallback',
    }
  }

  const ageShares = {
    ...nationalDemographicFallback.ageShares,
    ...(population.ageShares || {}),
    workingAge: Number(population.workingAgeShare)
      || population.ageShares?.workingAge
      || nationalDemographicFallback.ageShares.workingAge,
  }
  const sexShares = { ...nationalDemographicFallback.sexShares, ...(population.sexShares || {}) }
  const ethnicityShares = {
    ...nationalDemographicFallback.ethnicityShares,
    ...(population.ethnicityShares || {}),
  }
  const citizenshipShares = {
    ...nationalDemographicFallback.citizenshipShares,
    ...(population.citizenshipShares || {}),
  }

  return {
    population: population.population,
    workingAgeShare: Number(ageShares.workingAge.toFixed(3)),
    ageShares,
    sexShares,
    ethnicityShares,
    citizenshipShares,
    populationYear: population.year,
    incomeMedian: household.incomeMedian,
    incomeMean: household.incomeMean,
    expenditureMean: household.expenditureMean,
    poverty: household.poverty,
    hiesYear: household.hiesYear || household.year,
    cache: {
      population: population.cacheStatus,
      household: household.cacheStatus,
      maxAgeDays: cacheDays,
    },
    warnings,
    sources: [
      { name: 'data.gov.my Population by Administrative District', url: 'https://data.gov.my/data-catalogue/population_district' },
      { name: 'data.gov.my Household Income & Expenditure by District', url: 'https://data.gov.my/data-catalogue/hies_district' },
    ],
  }
}
