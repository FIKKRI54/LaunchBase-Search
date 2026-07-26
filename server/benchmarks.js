export const starterBenchmarks = [
  {
    slug: 'specialty_coffee',
    name: 'Specialty coffee shop',
    googlePlaceType: 'cafe',
    perCapitaSpendRm: 180,
    averageStoreSalesRm: 540000,
    incomeElasticity: 0.65,
    captureRate: 0.35,
    estimatedStoresPer100k: 10,
    osmTags: ['amenity=cafe'],
    classifierTypes: ['cafe'],
  },
  {
    slug: 'ice_cream',
    name: 'Ice cream shop',
    googlePlaceType: 'ice_cream_shop',
    perCapitaSpendRm: 65,
    averageStoreSalesRm: 400000,
    incomeElasticity: 0.5,
    captureRate: 0.32,
    estimatedStoresPer100k: 3,
    osmTags: ['shop=ice_cream', 'cuisine=ice_cream'],
    classifierTypes: ['ice_cream'],
  },
  {
    slug: 'boutique_fitness',
    name: 'Boutique fitness studio',
    googlePlaceType: 'fitness_center',
    perCapitaSpendRm: 140,
    averageStoreSalesRm: 720000,
    incomeElasticity: 0.85,
    captureRate: 0.28,
    estimatedStoresPer100k: 4,
    osmTags: ['leisure=fitness_centre'],
    classifierTypes: ['boutique_fitness'],
  },
  {
    slug: 'coworking',
    name: 'Flexible coworking hub',
    googlePlaceType: 'coworking_space',
    perCapitaSpendRm: 90,
    averageStoreSalesRm: 650000,
    incomeElasticity: 0.9,
    captureRate: 0.24,
    estimatedStoresPer100k: 1.5,
    osmTags: ['office=coworking'],
    classifierTypes: ['coworking'],
  },
  {
    slug: 'healthy_food',
    name: 'Healthy lunch bar',
    googlePlaceType: 'restaurant',
    perCapitaSpendRm: 220,
    averageStoreSalesRm: 600000,
    incomeElasticity: 0.7,
    captureRate: 0.3,
    estimatedStoresPer100k: 15,
    osmTags: ['amenity=restaurant', 'amenity=fast_food'],
    classifierTypes: ['healthy_food'],
  },
]

const audience = (key, baseline, weight, label) => ({
  audience: { [key]: { baseline, weight, label } },
})

export const defaultMarketProfiles = {
  specialty_coffee: { ...audience('youngAdults', 0.3, 0.42, 'young-adult and workday demand'), spendingElasticity: 0.12 },
  ice_cream: { ...audience('children', 0.23, 0.55, 'children and family demand'), spendingElasticity: 0.08 },
  boutique_fitness: { ...audience('youngAdults', 0.3, 0.6, 'young-adult fitness demand'), spendingElasticity: 0.18, discretionarySensitivity: 0.35 },
  coworking: { ...audience('workingAge', 0.69, 0.45, 'working-age flexible-work demand'), spendingElasticity: 0.15 },
  healthy_food: { ...audience('youngAdults', 0.3, 0.35, 'young-adult healthy-food demand'), spendingElasticity: 0.1 },
  bakery: { ...audience('familyAge', 0.3, 0.3, 'family and neighbourhood demand') },
  pharmacy: { ...audience('seniors', 0.08, 0.65, 'older-resident healthcare demand') },
  convenience: { ...audience('workingAge', 0.69, 0.18, 'everyday working-age demand') },
  laundry: { ...audience('youngAdults', 0.3, 0.22, 'young-adult and renter demand') },
  beauty: { ...audience('youngAdults', 0.3, 0.28, 'young-adult repeat-service demand'), spendingElasticity: 0.1 },
  nasi_kandar: { ...audience('workingAge', 0.69, 0.15, 'all-day working-age demand') },
  nasi_lemak: { ...audience('workingAge', 0.69, 0.12, 'breakfast and working-age demand') },
  mamak: { ...audience('youngAdults', 0.3, 0.18, 'young-adult and late-hour demand') },
  kopitiam: { ...audience('workingAge', 0.69, 0.12, 'breakfast and working-age demand') },
  malay_restaurant: {
    ...audience('familyAge', 0.3, 0.16, 'family dining demand'),
    culturalAffinity: { ethnicities: ['bumiMalay', 'bumiOther'], baseline: 0.64, weight: 0.18, label: 'Malay and Bumiputera cuisine affinity' },
  },
  indian_restaurant: {
    ...audience('familyAge', 0.3, 0.16, 'family dining demand'),
    culturalAffinity: { ethnicities: ['indian'], baseline: 0.07, weight: 0.25, label: 'Indian cuisine affinity' },
  },
  chinese_restaurant: {
    ...audience('familyAge', 0.3, 0.16, 'family dining demand'),
    culturalAffinity: { ethnicities: ['chinese'], baseline: 0.23, weight: 0.25, label: 'Chinese cuisine affinity' },
  },
  thai_restaurant: { ...audience('familyAge', 0.3, 0.1, 'family dining demand') },
  seafood_restaurant: { ...audience('familyAge', 0.3, 0.2, 'family and group dining demand'), spendingElasticity: 0.1 },
  western_restaurant: { ...audience('youngAdults', 0.3, 0.18, 'young-adult casual dining demand'), spendingElasticity: 0.1 },
  burger_shop: { ...audience('youngAdults', 0.3, 0.3, 'young-adult quick-meal demand') },
}

function withMarketProfile(benchmark) {
  const defaults = defaultMarketProfiles[benchmark.slug] || {}
  const supplied = benchmark.marketProfile || {}
  return {
    ...benchmark,
    marketProfile: {
      ...defaults,
      ...supplied,
      audience: { ...(defaults.audience || {}), ...(supplied.audience || {}) },
      culturalAffinity: supplied.culturalAffinity || defaults.culturalAffinity,
    },
  }
}

let benchmarkCache = null
let benchmarkCacheExpiresAt = 0
let benchmarkRequest = null
const benchmarkCacheMs = Math.max(30, Number(process.env.BENCHMARK_CACHE_SECONDS || 300)) * 1000

export async function getBenchmarks(database) {
  if (benchmarkCache && benchmarkCacheExpiresAt > Date.now()) return benchmarkCache
  if (benchmarkRequest) return benchmarkRequest

  benchmarkRequest = (async () => {
    const result = await database.tryQuery(`
      SELECT slug, name, google_place_type, per_capita_spend_rm,
        average_store_sales_rm, income_elasticity, capture_rate,
        estimated_stores_per_100k, osm_tags, classifier_types, assumptions
      FROM business_benchmarks
      ORDER BY slug
    `)
    benchmarkCache = !result?.rows?.length
      ? starterBenchmarks.map(withMarketProfile)
      : result.rows.map((row) => withMarketProfile({
        slug: row.slug,
        name: row.name,
        googlePlaceType: row.google_place_type,
        perCapitaSpendRm: Number(row.per_capita_spend_rm),
        averageStoreSalesRm: Number(row.average_store_sales_rm),
        incomeElasticity: Number(row.income_elasticity),
        captureRate: Number(row.capture_rate),
        estimatedStoresPer100k: Number(row.estimated_stores_per_100k),
        osmTags: row.osm_tags || [],
        classifierTypes: row.classifier_types || [],
        marketProfile: row.assumptions?.marketProfile || {},
      }))
    benchmarkCacheExpiresAt = Date.now() + benchmarkCacheMs
    return benchmarkCache
  })().finally(() => {
    benchmarkRequest = null
  })
  return benchmarkRequest
}

export function clearBenchmarkCacheForTests() {
  benchmarkCache = null
  benchmarkCacheExpiresAt = 0
  benchmarkRequest = null
}
