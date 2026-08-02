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
  specialty_coffee: {
    ...audience('youngAdults', 0.3, 0.42, 'young-adult and workday demand'),
    spendingElasticity: 0.12,
    competition: { group: 'food', broadWeight: 0.012, substitutes: { kopitiam: 0.35, bakery: 0.12, roti_bakar_cafe: 0.25 } },
  },
  ice_cream: {
    ...audience('children', 0.23, 0.55, 'children and family demand'),
    spendingElasticity: 0.08,
    competition: { group: 'food', broadWeight: 0.006, substitutes: { pastry_shop: 0.18, bakery: 0.08, cafe: 0.06 } },
  },
  boutique_fitness: {
    ...audience('youngAdults', 0.3, 0.6, 'young-adult fitness demand'),
    spendingElasticity: 0.18,
    discretionarySensitivity: 0.35,
    competition: { group: 'health', broadWeight: 0.01, substitutes: { sports_centre: 0.3, dance_studio: 0.18 } },
  },
  coworking: {
    ...audience('workingAge', 0.69, 0.45, 'working-age flexible-work demand'),
    spendingElasticity: 0.15,
    competition: { group: 'professional', broadWeight: 0.004, substitutes: {} },
  },
  healthy_food: {
    ...audience('youngAdults', 0.3, 0.35, 'young-adult healthy-food demand'),
    spendingElasticity: 0.1,
    competition: { group: 'food', broadWeight: 0.012, substitutes: { health_food_shop: 0.25, cafe: 0.08, restaurant_other: 0.08 } },
  },
  bakery: {
    ...audience('familyAge', 0.3, 0.3, 'family and neighbourhood demand'),
    competition: { group: 'food', broadWeight: 0.008, substitutes: { pastry_shop: 0.45, cafe: 0.08, convenience: 0.04 } },
  },
  pharmacy: {
    ...audience('seniors', 0.08, 0.65, 'older-resident healthcare demand'),
    competition: { group: 'health', broadWeight: 0.004, substitutes: { medical_supply_shop: 0.12 } },
  },
  convenience: {
    ...audience('workingAge', 0.69, 0.18, 'everyday working-age demand'),
    competition: { group: 'retail', broadWeight: 0.004, substitutes: { supermarket: 0.55, general_store: 0.3, variety_store: 0.16, kiosk: 0.08 } },
  },
  laundry: {
    ...audience('youngAdults', 0.3, 0.22, 'young-adult and renter demand'),
    competition: { group: 'services', broadWeight: 0.002, substitutes: { dry_cleaner: 0.45 } },
  },
  beauty: {
    ...audience('youngAdults', 0.3, 0.28, 'young-adult repeat-service demand'),
    spendingElasticity: 0.1,
    competition: { group: 'services', broadWeight: 0.004, substitutes: { cosmetics_shop: 0.08 } },
  },
  nasi_kandar: {
    ...audience('workingAge', 0.69, 0.15, 'all-day working-age demand'),
    competition: {
      group: 'food',
      broadWeight: 0.018,
      substitutes: { mamak: 0.8, indian_restaurant: 0.65, roti_canai: 0.45, malay_restaurant: 0.12, restaurant_other: 0.08, fast_food_other: 0.05 },
    },
  },
  nasi_lemak: {
    ...audience('workingAge', 0.69, 0.12, 'breakfast and working-age demand'),
    competition: { group: 'food', broadWeight: 0.016, substitutes: { malay_restaurant: 0.5, warung: 0.45, kopitiam: 0.3, nasi_campur_restaurant: 0.25, restaurant_other: 0.07 } },
  },
  mamak: {
    ...audience('youngAdults', 0.3, 0.18, 'young-adult and late-hour demand'),
    competition: { group: 'food', broadWeight: 0.018, substitutes: { nasi_kandar: 0.8, indian_restaurant: 0.6, roti_canai: 0.5, restaurant_other: 0.08 } },
  },
  kopitiam: {
    ...audience('workingAge', 0.69, 0.12, 'breakfast and working-age demand'),
    competition: { group: 'food', broadWeight: 0.014, substitutes: { cafe: 0.45, roti_bakar_cafe: 0.5, nasi_lemak: 0.18, restaurant_other: 0.05 } },
  },
  malay_restaurant: {
    ...audience('familyAge', 0.3, 0.16, 'family dining demand'),
    culturalAffinity: { ethnicities: ['bumiMalay', 'bumiOther'], baseline: 0.64, weight: 0.18, label: 'Malay and Bumiputera cuisine affinity' },
    competition: { group: 'food', broadWeight: 0.02, substitutes: { nasi_campur_restaurant: 0.55, warung: 0.4, nasi_lemak: 0.2, restaurant_other: 0.1 } },
  },
  indian_restaurant: {
    ...audience('familyAge', 0.3, 0.16, 'family dining demand'),
    culturalAffinity: { ethnicities: ['indian'], baseline: 0.07, weight: 0.25, label: 'Indian cuisine affinity' },
    competition: { group: 'food', broadWeight: 0.02, substitutes: { nasi_kandar: 0.65, mamak: 0.6, roti_canai: 0.35, restaurant_other: 0.1 } },
  },
  chinese_restaurant: {
    ...audience('familyAge', 0.3, 0.16, 'family dining demand'),
    culturalAffinity: { ethnicities: ['chinese'], baseline: 0.23, weight: 0.25, label: 'Chinese cuisine affinity' },
    competition: { group: 'food', broadWeight: 0.02, substitutes: { noodle_restaurant: 0.35, dim_sum: 0.25, hainanese_restaurant: 0.22, restaurant_other: 0.1 } },
  },
  thai_restaurant: {
    ...audience('familyAge', 0.3, 0.1, 'family dining demand'),
    competition: { group: 'food', broadWeight: 0.018, substitutes: { restaurant_other: 0.1, seafood_restaurant: 0.12 } },
  },
  seafood_restaurant: {
    ...audience('familyAge', 0.3, 0.2, 'family and group dining demand'),
    spendingElasticity: 0.1,
    competition: { group: 'food', broadWeight: 0.018, substitutes: { seafood_shop: 0.08, thai_restaurant: 0.12, restaurant_other: 0.1 } },
  },
  western_restaurant: {
    ...audience('youngAdults', 0.3, 0.18, 'young-adult casual dining demand'),
    spendingElasticity: 0.1,
    competition: { group: 'food', broadWeight: 0.018, substitutes: { burger_shop: 0.4, pizza_shop: 0.2, restaurant_other: 0.1 } },
  },
  burger_shop: {
    ...audience('youngAdults', 0.3, 0.3, 'young-adult quick-meal demand'),
    competition: { group: 'food', broadWeight: 0.016, substitutes: { fried_chicken: 0.35, western_restaurant: 0.3, fast_food_other: 0.2 } },
  },
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
    const [result, validationResult, outcomeResult] = await Promise.all([
      database.tryQuery(`
        SELECT slug, name, google_place_type, per_capita_spend_rm,
          average_store_sales_rm, income_elasticity, capture_rate,
          estimated_stores_per_100k, osm_tags, classifier_types, assumptions
        FROM business_benchmarks
        ORDER BY slug
      `),
      database.tryQuery(`
        SELECT DISTINCT ON (category_slug)
          category_slug, model_version, sample_size, holdout_size,
          holdout_strategy, metrics, baselines, status, validated_at
        FROM model_validation_runs
        ORDER BY category_slug, validated_at DESC
      `),
      database.tryQuery(`
        SELECT category_slug,
          COUNT(*)::integer AS observation_count,
          COUNT(DISTINCT external_ref_hash)::integer AS store_count,
          MAX(observation_month) AS latest_observation
        FROM business_outcomes
        GROUP BY category_slug
      `),
    ])
    const validationByCategory = new Map((validationResult?.rows || []).map((row) => [
      row.category_slug,
      {
        status: row.status,
        modelVersion: row.model_version,
        sampleSize: Number(row.sample_size),
        holdoutSize: Number(row.holdout_size),
        holdoutStrategy: row.holdout_strategy,
        metrics: row.metrics || {},
        baselines: row.baselines || {},
        validatedAt: row.validated_at,
      },
    ]))
    const outcomesByCategory = new Map((outcomeResult?.rows || []).map((row) => [
      row.category_slug,
      {
        observationCount: Number(row.observation_count),
        storeCount: Number(row.store_count),
        latestObservation: row.latest_observation,
      },
    ]))
    const attachValidation = (benchmark) => ({
      ...benchmark,
      validation: validationByCategory.get(benchmark.slug) || {
        status: 'not-validated',
        sampleSize: 0,
        holdoutSize: 0,
        metrics: {},
      },
      outcomeCoverage: outcomesByCategory.get(benchmark.slug) || {
        observationCount: 0,
        storeCount: 0,
        latestObservation: null,
      },
    })
    benchmarkCache = !result?.rows?.length
      ? starterBenchmarks.map(withMarketProfile).map(attachValidation)
      : result.rows.map((row) => attachValidation(withMarketProfile({
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
      })))
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
