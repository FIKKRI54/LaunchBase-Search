import { matchesMarketTags } from './openMarket.js'

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum)
const money = (value) => Math.round(value)
const oneDecimal = (value) => Number(value.toFixed(1))
const mapResponseBusinessLimit = Math.min(2500, Math.max(300, Number(process.env.MAP_RESPONSE_BUSINESS_LIMIT || 1000)))

const stablePlaceOrder = (left, right) => String(left.id).localeCompare(String(right.id))

function interleaveTypes(places) {
  const byType = new Map()
  for (const place of [...places].sort(stablePlaceOrder)) {
    const type = place.marketType || 'other'
    const group = byType.get(type) || []
    group.push(place)
    byType.set(type, group)
  }
  const queues = [...byType.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entries]) => entries)
  const interleaved = []
  for (let depth = 0; interleaved.length < places.length; depth += 1) {
    for (const queue of queues) {
      if (queue[depth]) interleaved.push(queue[depth])
    }
  }
  return interleaved
}

export function selectMapBusinesses(
  places,
  limit = mapResponseBusinessLimit,
  { lat, lng, radiusMeters } = {},
) {
  const eligible = places.filter((place) =>
    place.marketType !== 'other_business'
    && Number.isFinite(Number(place.lat))
    && Number.isFinite(Number(place.lng)),
  )
  if (eligible.length <= limit) return eligible

  const centerLat = Number.isFinite(Number(lat))
    ? Number(lat)
    : eligible.reduce((total, place) => total + Number(place.lat), 0) / eligible.length
  const centerLng = Number.isFinite(Number(lng))
    ? Number(lng)
    : eligible.reduce((total, place) => total + Number(place.lng), 0) / eligible.length
  const latRadius = Number.isFinite(Number(radiusMeters))
    ? Math.max(500, Number(radiusMeters)) / 111_320
    : Math.max(...eligible.map((place) => Math.abs(Number(place.lat) - centerLat)), 0.01)
  const lngScale = Math.max(0.2, Math.cos(centerLat * Math.PI / 180))
  const lngRadius = Number.isFinite(Number(radiusMeters))
    ? Math.max(500, Number(radiusMeters)) / (111_320 * lngScale)
    : Math.max(...eligible.map((place) => Math.abs(Number(place.lng) - centerLng)), 0.01)
  const gridSide = Math.min(24, Math.max(8, Math.ceil(Math.sqrt(limit / 4))))
  const cells = new Map()
  for (const place of eligible) {
    const x = clamp(Math.floor(((Number(place.lng) - centerLng + lngRadius) / (lngRadius * 2)) * gridSide), 0, gridSide - 1)
    const y = clamp(Math.floor(((Number(place.lat) - centerLat + latRadius) / (latRadius * 2)) * gridSide), 0, gridSide - 1)
    const key = `${y}:${x}`
    const bucket = cells.get(key) || []
    bucket.push(place)
    cells.set(key, bucket)
  }

  // Interleave both spatial cells and business types. OpenStreetMap's `qt`
  // output is geographically ordered, so taking the first N records creates
  // a misleading marker pile in one corner of a dense scan.
  const cellQueues = [...cells.entries()]
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([, bucket]) => interleaveTypes(bucket))
  const selected = []
  for (let depth = 0; selected.length < limit; depth += 1) {
    let added = false
    for (const queue of cellQueues) {
      if (!queue[depth]) continue
      selected.push(queue[depth])
      added = true
      if (selected.length >= limit) break
    }
    if (!added) break
  }
  return selected
}

const formatSuggestions = {
  specialty_coffee: 'Specialty coffee bar built around takeaway breakfast, workday traffic and a compact seating plan',
  ice_cream: 'Dessert-led ice cream shop with evening hours, family bundles and delivery-friendly packaging',
  boutique_fitness: 'Small-group fitness studio with recurring memberships and after-work class slots',
  coworking: 'Flexible coworking hub with day passes, meeting rooms and small-team memberships',
  healthy_food: 'Healthy rice-bowl and vegetarian lunch bar focused on weekday delivery and takeaway',
  bakery: 'Neighbourhood bakery focused on breakfast, fresh bread, celebration orders and takeaway',
  pharmacy: 'Community pharmacy combining prescriptions, everyday health products and local delivery',
  convenience: 'Compact convenience store prioritising daily essentials, ready-to-eat food and late hours',
  laundry: 'Self-service dobi with cashless machines, wash-and-fold service and pickup options',
  beauty: 'Appointment-led hair and beauty studio with repeat-service packages',
  nasi_kandar: 'Nasi kandar restaurant with fast lunch service, takeaway packs and late operating hours',
  nasi_lemak: 'Nasi lemak shop focused on breakfast, office packs and delivery bundles',
  mamak: 'Neighbourhood mamak restaurant built around all-day meals, drinks and late-night demand',
  kopitiam: 'Modern kopitiam combining breakfast staples, quick lunches and takeaway drinks',
  malay_restaurant: 'Malay food restaurant focused on rice sets, family meals and office catering',
  indian_restaurant: 'Indian restaurant focused on breakfast breads, rice meals and family dining',
  chinese_restaurant: 'Chinese neighbourhood restaurant with family meals, takeaway and group dining',
  thai_restaurant: 'Tom yam and Thai restaurant with sharing sets, dinner trade and delivery bundles',
  seafood_restaurant: 'Seafood restaurant designed for group dining, dinner demand and advance bookings',
  western_restaurant: 'Western grill with focused mains, family bundles and evening delivery',
  burger_shop: 'Compact burger shop with late-evening service, combo meals and delivery',
}

function marketEvidenceFor(market, studyPopulation) {
  const hasLiveMarket = market.provider === 'openstreetmap-overpass'
  if (!hasLiveMarket) {
    return {
      level: 'low',
      score: 12,
      coverageFactor: 0,
      mappedPerThousandResidents: 0,
      namedShare: 0,
      classifiedShare: 0,
      note: 'Live mapped supply was unavailable, so density baselines are used.',
    }
  }

  const mapped = market.places.length
  const named = market.places.filter((place) => place.name !== 'Unnamed mapped business').length
  const classified = market.places.filter((place) => place.specificity === 'specific').length
  const mappedPerThousandResidents = mapped / Math.max(studyPopulation / 1000, 1)
  const coverageFactor = clamp(mappedPerThousandResidents / 3.5, 0.12, 1)
  const namedShare = mapped ? named / mapped : 0
  const classifiedShare = mapped ? classified / mapped : 0
  const partialScan = market.scanScope === 'focused' || market.scanScope === 'node-focused'
  const scanScopeFactor = market.scanScope === 'node-focused'
    ? 0.78
    : market.scanScope === 'focused'
      ? 0.88
      : 1
  const evidenceCeiling = market.scanScope === 'node-focused'
    ? 74
    : market.scanScope === 'focused'
      ? 85
      : 100
  const score = Math.round(clamp(
    (coverageFactor * 65 + namedShare * 20 + classifiedShare * 15) * scanScopeFactor,
    5,
    evidenceCeiling,
  ))
  const level = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low'

  return {
    level,
    score,
    coverageFactor: Number(coverageFactor.toFixed(2)),
    mappedPerThousandResidents: Number(mappedPerThousandResidents.toFixed(2)),
    namedShare: Number(namedShare.toFixed(2)),
    classifiedShare: Number(classifiedShare.toFixed(2)),
    note: partialScan
      ? market.scanScope === 'node-focused'
        ? 'A high-density node scan was used for reliability. It provides live storefront markers, but businesses mapped only as building polygons may be missing.'
        : 'A focused retail and service scan was used after the wider market query failed; general office and tourism coverage may be incomplete.'
      : level === 'high'
      ? 'The mapped market is relatively detailed, but unmapped businesses can still exist.'
      : 'Mapped supply appears incomplete; category counts are blended with a conservative density baseline.',
  }
}

function recommendationFormat(benchmark, statistics) {
  const base = formatSuggestions[benchmark.slug]
    || `${benchmark.name} with a focused offer, compact operating model and local delivery`
  const incomePosition = statistics.incomeMedian >= 9500
    ? 'Premium-leaning'
    : statistics.incomeMedian < 5500 ? 'Value-led' : 'Mid-market'
  return `${incomePosition} ${base.charAt(0).toLowerCase()}${base.slice(1)}`
}

function evaluateAudienceFit(benchmark, statistics) {
  const genericFactor = clamp(0.8 + statistics.workingAgeShare * 0.35, 0.85, 1.1)
  const audience = benchmark.marketProfile?.audience || {}
  let adjustment = 1
  const signals = []

  for (const [key, configuration] of Object.entries(audience)) {
    const actual = Number(statistics.ageShares?.[key])
    if (!Number.isFinite(actual)) continue
    const baseline = Number(configuration.baseline)
    const weight = Number(configuration.weight)
    if (!Number.isFinite(baseline) || !Number.isFinite(weight)) continue
    adjustment += (actual - baseline) * weight
    signals.push(
      `${Math.round(actual * 100)}% ${configuration.label || key} ${actual >= baseline ? 'supports' : 'softens'} this category`,
    )
  }

  return {
    factor: clamp(genericFactor * adjustment, 0.75, 1.25),
    signals,
  }
}

function restrictedMarketEvidence(market, restrictedProducts) {
  const terms = {
    pork: /\b(pork|pig|char\s*siu|siew\s*yuk|babi|siu\s*mei|bak\s*kut\s*teh)\b/i,
    alcohol: /\b(bar|pub|beer|wine|liquor|alcohol)\b/i,
  }
  return (market?.places || []).filter((place) => {
    const searchable = [
      place.name,
      place.marketType,
      place.marketTypeLabel,
      place.tags?.cuisine,
      place.tags?.shop,
      place.tags?.amenity,
    ].filter(Boolean).join(' ')
    return restrictedProducts.some((product) => terms[product]?.test(searchable))
      || place.tags?.['diet:halal'] === 'no'
  })
}

function restrictedProductsFor(benchmark) {
  const configured = benchmark.marketProfile?.restrictedProducts || []
  const searchable = [
    benchmark.slug,
    benchmark.name,
    benchmark.googlePlaceType,
    ...(benchmark.osmTags || []),
    ...(benchmark.classifierTypes || []),
  ].filter(Boolean).join(' ').replaceAll('_', ' ')
  const inferred = [
    ...(/\b(pork|pig|babi|bak\s*kut\s*teh|char\s*siu|siew\s*yuk)\b/i.test(searchable) ? ['pork'] : []),
    ...(/\b(alcohol|liquor|beer|wine|pub)\b/i.test(searchable) ? ['alcohol'] : []),
  ]
  return [...new Set([...configured, ...inferred])]
}

export function evaluateCulturalFit({ benchmark, statistics, market }) {
  const profile = benchmark.marketProfile || {}
  const affinity = profile.culturalAffinity
  let factor = 1
  const signals = []

  if (affinity) {
    const actual = (affinity.ethnicities || []).reduce(
      (sum, key) => sum + Number(statistics.ethnicityShares?.[key] || 0),
      0,
    )
    factor = clamp(
      1 + (actual - Number(affinity.baseline || 0)) * Number(affinity.weight || 0),
      0.85,
      1.15,
    )
    signals.push(
      `${Math.round(actual * 100)}% district population share is associated with ${affinity.label || 'this cuisine'}; this is only a modest cuisine-affinity signal`,
    )
  }

  const restrictedProducts = restrictedProductsFor(benchmark)
  if (!restrictedProducts.length) {
    return {
      factor,
      eligibleForRecommendation: true,
      status: 'compatible-or-not-applicable',
      signals,
      warnings: [],
      warning: null,
    }
  }

  const muslimShare = Number(statistics.religionShares?.muslim)
  const liveEvidence = restrictedMarketEvidence(market, restrictedProducts)
  if (Number.isFinite(muslimShare) && muslimShare >= 0.7) {
    const warning = `This ${restrictedProducts.join('/')} concept conflicts with the district's explicit aggregate religion profile.`
    return {
      factor: Math.min(factor * 0.2, 0.25),
      eligibleForRecommendation: false,
      status: 'culturally-incompatible',
      signals,
      warnings: [warning],
      warning,
    }
  }
  if (Number.isFinite(muslimShare) && muslimShare >= 0.5 && liveEvidence.length < 3) {
    const warning = `This ${restrictedProducts.join('/')} concept needs stronger local demand evidence because the explicit aggregate religion profile indicates limited fit.`
    return {
      factor: Math.min(factor * 0.45, 0.55),
      eligibleForRecommendation: false,
      status: 'culturally-incompatible',
      signals,
      warnings: [warning],
      warning,
    }
  }
  if (!Number.isFinite(muslimShare) && liveEvidence.length < 2) {
    const warning = 'Ethnicity is not used as a religion proxy. This restricted-product concept is withheld until aggregate religion or strong local-market evidence is available.'
    return {
      factor: Math.min(factor * 0.45, 0.55),
      eligibleForRecommendation: false,
      status: 'insufficient-religion-or-market-evidence',
      signals,
      warnings: [warning],
      warning,
    }
  }

  const warning = `Restricted-product fit is based on ${liveEvidence.length} relevant mapped businesses and still requires local validation.`
  return {
    factor: clamp(factor * 0.85, 0.4, 1),
    eligibleForRecommendation: true,
    status: 'conditional-local-market-evidence',
    signals,
    warnings: [warning],
    warning,
  }
}

export function buildAnalysis({ location, statistics, market, benchmarks, radiusKm }) {
  const nationalMedianIncomeAssumption = 7000
  const spatialShare = clamp(Math.pow(radiusKm / 12, 2), 0.05, 1)
  const studyPopulation = Math.round(statistics.population * spatialShare)
  const marketEvidence = marketEvidenceFor(market, studyPopulation)
  const placesByType = new Map()
  let classifiedBusinesses = 0
  let broadBusinesses = 0
  let unresolvedBusinesses = 0
  const marketBreakdownGroups = market.places.reduce((groups, place) => {
    if (place.specificity === 'specific') classifiedBusinesses += 1
    else if (place.specificity === 'broad') broadBusinesses += 1
    else if (place.specificity === 'unresolved') unresolvedBusinesses += 1
    for (const type of new Set([place.marketType, ...(place.marketFacets || [])].filter(Boolean))) {
      const indexed = placesByType.get(type) || []
      indexed.push(place)
      placesByType.set(type, indexed)
    }
    if (place.marketType === 'other_business') return groups
    const group = groups.get(place.marketType) || {
      slug: place.marketType,
      label: place.marketTypeLabel,
      group: place.marketGroup,
      count: 0,
      examples: [],
      sourceCounts: {},
      specificity: place.specificity || 'specific',
    }
    group.count += 1
    const taxonomySource = place.taxonomySource || 'legacy-classifier'
    group.sourceCounts[taxonomySource] = (group.sourceCounts[taxonomySource] || 0) + 1
    if (place.specificity === 'broad') group.specificity = 'broad'
    if (
      place.name !== 'Unnamed mapped business'
      && group.examples.length < 4
      && !group.examples.includes(place.name)
    ) {
      group.examples.push(place.name)
    }
    groups.set(place.marketType, group)
    return groups
  }, new Map())
  const marketBreakdown = [...marketBreakdownGroups.values()].sort((a, b) => b.count - a.count)

  const opportunities = benchmarks.map((benchmark) => {
    const incomeRatio = statistics.incomeMedian / nationalMedianIncomeAssumption
    const incomeFactor = clamp(1 + (incomeRatio - 1) * benchmark.incomeElasticity, 0.65, 1.55)
    const audienceFit = evaluateAudienceFit(benchmark, statistics)
    const culturalFit = evaluateCulturalFit({ benchmark, statistics, market })
    const spendingElasticity = Number(benchmark.marketProfile?.spendingElasticity || 0)
    const expenditureRatio = Number(statistics.expenditureMean || 5000) / 5000
    const expenditureFactor = clamp(1 + (expenditureRatio - 1) * spendingElasticity, 0.82, 1.25)
    const discretionarySensitivity = Number(benchmark.marketProfile?.discretionarySensitivity || 0)
    const povertyFactor = clamp(
      1 - Math.max(0, Number(statistics.poverty || 0) - 5) / 100 * discretionarySensitivity,
      0.82,
      1,
    )
    const potentialDemand = studyPopulation
      * benchmark.perCapitaSpendRm
      * incomeFactor
      * audienceFit.factor
      * culturalFit.factor
      * expenditureFactor
      * povertyFactor
      * benchmark.captureRate
    const supportableStores = potentialDemand / benchmark.averageStoreSalesRm
    const observed = benchmark.classifierTypes?.length
      ? [...new Map(
        benchmark.classifierTypes
          .flatMap((classifierType) => placesByType.get(classifierType) || [])
          .map((place) => [place.id, place]),
      ).values()]
      : market.places.filter((place) => matchesMarketTags(place.tags, benchmark.osmTags))
    const hasLiveMarket = market.provider === 'openstreetmap-overpass'
    const modelledCompetitors = Math.max(
      0,
      (studyPopulation / 100000) * benchmark.estimatedStoresPer100k,
    )
    const baselineFloor = modelledCompetitors * (1 - marketEvidence.coverageFactor * 0.65)
    const adjustedCompetitors = hasLiveMarket
      ? Math.max(observed.length, baselineFloor)
      : modelledCompetitors
    const competitorCount = hasLiveMarket ? observed.length : Math.round(modelledCompetitors)
    const fairShareSales = potentialDemand / (adjustedCompetitors + 1)
    const unmetDemand = Math.max(0, potentialDemand - adjustedCompetitors * benchmark.averageStoreSalesRm)
    const unmetStores = unmetDemand / benchmark.averageStoreSalesRm

    const saturation = adjustedCompetitors / Math.max(supportableStores, 0.5)
    const fairShareRatio = fairShareSales / benchmark.averageStoreSalesRm
    const demandScore = clamp(28 + Math.log1p(supportableStores) * 16, 12, 85)
    const gapScore = clamp(72 - saturation * 42, 8, 78)
    const fairShareScore = clamp(35 + Math.log2(Math.max(fairShareRatio, 0.25)) * 18, 8, 82)
    const incomeScore = clamp(52 + Math.log(Math.max(incomeRatio, 0.35)) * 25, 25, 76)
    const competitionScore = clamp(70 - saturation * 50, 8, 80)
    const categoryConfidence = marketEvidence.level === 'high' && observed.length >= 5
      ? 'high'
      : marketEvidence.level !== 'low' && observed.length >= 2 ? 'medium' : 'low'
    const rawScore = (
      demandScore * 0.23
      + gapScore * 0.25
      + fairShareScore * 0.18
      + incomeScore * 0.12
      + competitionScore * 0.12
      + marketEvidence.score * 0.1
    )
    const uncertaintyPenalty = categoryConfidence === 'low' ? 10 : categoryConfidence === 'medium' ? 4 : 0
    const confidenceCap = categoryConfidence === 'low' ? 68 : categoryConfidence === 'medium' ? 80 : 88
    const evidenceAdjustedScore = clamp(rawScore - uncertaintyPenalty, 5, confidenceCap)
    const rankingScore = culturalFit.eligibleForRecommendation
      ? evidenceAdjustedScore
      : Math.min(evidenceAdjustedScore, 25)
    const successScore = Math.round(rankingScore)
    const adjustedCompetitorCount = oneDecimal(adjustedCompetitors)
    const riskFlags = [
      ...(observed.length === 0 && hasLiveMarket
        ? ['No directly mapped competitor was found; this is missing-evidence risk, not proof of an empty market.']
        : []),
      ...(observed.length > 0 && observed.length < 3 && hasLiveMarket
        ? [`Only ${observed.length} directly mapped competitor${observed.length === 1 ? ' was' : 's were'} found; niche-level supply evidence is thin.`]
        : []),
      ...(marketEvidence.level === 'low'
        ? ['Mapped-business coverage is thin, so the supply estimate relies more heavily on the density baseline.']
        : []),
      ...culturalFit.warnings,
      ...(supportableStores < 1
        ? ['Estimated demand is below one benchmark store’s annual sales requirement.']
        : []),
      ['Study-area population is radius-allocated from district data, not a small-area census count.'],
    ]

    return {
      slug: benchmark.slug,
      name: benchmark.name,
      placeType: benchmark.googlePlaceType,
      marketTypes: benchmark.classifierTypes || [],
      successScore,
      rankingScore: Number(rankingScore.toFixed(2)),
      scoreBand: successScore >= 75
        ? 'Strong candidate to validate'
        : successScore >= 60 ? 'Promising, validate locally' : successScore >= 45 ? 'Conditional opportunity' : 'Weak current fit',
      scoreLabel: 'Opportunity index',
      confidence: categoryConfidence,
      confidenceLabel: `${categoryConfidence[0].toUpperCase()}${categoryConfidence.slice(1)} evidence`,
      eligibleForRecommendation: culturalFit.eligibleForRecommendation,
      eligibilityStatus: culturalFit.status,
      recommendedFormat: recommendationFormat(benchmark, statistics),
      potentialDemandRm: money(potentialDemand),
      fairShareSalesRm: money(fairShareSales),
      unmetDemandRm: money(unmetDemand),
      supportableStores: Number(supportableStores.toFixed(1)),
      competitorCount,
      adjustedCompetitors: adjustedCompetitorCount,
      competitorSource: hasLiveMarket ? 'live-openstreetmap' : 'modelled-density',
      observedCompetitors: hasLiveMarket ? competitorCount : null,
      estimatedCompetitors: oneDecimal(modelledCompetitors),
      competitorBasis: hasLiveMarket
        ? `${competitorCount} directly mapped; ${adjustedCompetitorCount} used after the market-coverage baseline`
        : `${benchmark.estimatedStoresPer100k} modelled stores per 100,000 residents`,
      specificMarketTypes: [...new Set(observed.map((place) => place.marketTypeLabel))],
      businessExamples: observed
        .filter((place) => place.name !== 'Unnamed mapped business')
        .slice(0, 5)
        .map((place) => ({
          name: place.name,
          type: place.marketTypeLabel,
          confidence: place.classificationConfidence,
          signals: place.classificationSignals,
          mapUrl: `https://www.openstreetmap.org/${place.id}`,
        })),
      scoreSignals: {
        demand: Math.round(demandScore),
        marketGap: Math.round(gapScore),
        fairShare: Math.round(fairShareScore),
        income: Math.round(incomeScore),
        competition: Math.round(competitionScore),
        evidence: marketEvidence.score,
      },
      demandFactors: {
        income: Number(incomeFactor.toFixed(2)),
        audience: Number(audienceFit.factor.toFixed(2)),
        cultural: Number(culturalFit.factor.toFixed(2)),
        householdSpending: Number(expenditureFactor.toFixed(2)),
        affordability: Number(povertyFactor.toFixed(2)),
      },
      demographicSignals: [...audienceFit.signals, ...culturalFit.signals],
      culturalFit: {
        status: culturalFit.status,
        eligibleForRecommendation: culturalFit.eligibleForRecommendation,
        warning: culturalFit.warning,
      },
      scoreExplanation: [
        `${Number(supportableStores.toFixed(1))} benchmark stores supported by estimated category demand`,
        `${competitorCount} directly mapped and ${adjustedCompetitorCount} competitors used after coverage adjustment`,
        `${marketEvidence.level} mapped-market evidence (${marketEvidence.score}/100 evidence score)`,
      ],
      riskFlags,
      mapSearchQuery: `${benchmark.name} near ${location.formattedAddress}`,
      benchmark: {
        perCapitaSpendRm: benchmark.perCapitaSpendRm,
        averageStoreSalesRm: benchmark.averageStoreSalesRm,
        incomeFactor: Number(incomeFactor.toFixed(2)),
        estimatedStoresPer100k: benchmark.estimatedStoresPer100k,
      },
    }
  }).sort((a, b) =>
    Number(b.eligibleForRecommendation) - Number(a.eligibleForRecommendation)
    || b.rankingScore - a.rankingScore,
  )

  return {
    generatedAt: new Date().toISOString(),
    location,
    radiusKm,
    area: {
      population: studyPopulation,
      populationLow: Math.round(studyPopulation * 0.7),
      populationHigh: Math.round(studyPopulation * 1.3),
      districtPopulation: statistics.population,
      spatialShare: Number(spatialShare.toFixed(3)),
      workingAgeShare: statistics.workingAgeShare,
      ageShares: statistics.ageShares || {},
      sexShares: statistics.sexShares || {},
      ethnicityShares: statistics.ethnicityShares || {},
      citizenshipShares: statistics.citizenshipShares || {},
      medianHouseholdIncomeRm: statistics.incomeMedian,
      meanHouseholdExpenditureRm: statistics.expenditureMean,
      povertyRate: statistics.poverty,
      populationYear: statistics.populationYear,
      hiesYear: statistics.hiesYear,
    },
    opportunities,
    marketBreakdown,
    mapBusinesses: selectMapBusinesses(market.places, mapResponseBusinessLimit, {
      lat: location.lat,
      lng: location.lng,
      radiusMeters: radiusKm * 1000,
    })
      .map((place) => ({
        id: place.id,
        name: place.name,
        lat: Number(place.lat),
        lng: Number(place.lng),
        type: place.marketType,
        typeLabel: place.marketTypeLabel,
        group: place.marketGroup,
        confidence: place.classificationConfidence,
        facets: place.marketFacets,
        taxonomySource: place.taxonomySource,
        specificity: place.specificity,
      })),
    dataQuality: {
      supplyProvider: market.provider,
      marketCache: market.cacheStatus,
      marketFetchedAt: market.fetchedAt,
      marketScanStatus: market.provider !== 'openstreetmap-overpass'
        ? 'unavailable'
        : market.places.length
          ? market.scanScope === 'full' ? 'complete' : 'partial'
          : 'complete-empty',
      supplyAvailable: market.provider === 'openstreetmap-overpass',
      mappedBusinesses: market.places.length,
      classifiedBusinesses,
      broadBusinesses,
      unresolvedBusinesses,
      marketEvidence,
      taxonomyCoverage: market.places.length
        ? Number((classifiedBusinesses / market.places.length).toFixed(3))
        : 0,
      googleMapRole: 'optional-visual-validation-only',
      locationProvider: location.provider,
      locationCache: location.cacheStatus,
      malaysiaDataCache: statistics.cache,
      demographicProfile: {
        ageAvailable: Boolean(statistics.ageShares),
        sexAvailable: Boolean(statistics.sexShares),
        ethnicityAvailable: Boolean(statistics.ethnicityShares),
        citizenshipAvailable: Boolean(statistics.citizenshipShares),
        religionAvailable: Boolean(statistics.religionShares),
        note: 'Ethnicity is used only as a modest cuisine-affinity signal and never as a proxy for religion.',
      },
      warnings: [
        ...statistics.warnings,
        ...(location.warning ? [location.warning] : []),
        ...(market.warning ? [market.warning] : []),
      ],
    },
    methodology: {
      demand: 'We estimate how many people live nearby, adjust for the category’s relevant age groups, household income and spending, then apply a cautious category capture rate',
      spatialAllocation: 'district population × a starter radius-based spatial share; replace with small-area population grids for production',
      supportableStores: 'estimated market demand ÷ average annual store sales',
      fairShare: 'estimated market demand ÷ (coverage-adjusted competitors + proposed store); observed supply is never assumed complete',
      competitorEstimate: 'nearby OpenStreetMap features classified from structured business tags, cuisine combinations and an English/Malay name dictionary, then blended with a density floor when coverage is incomplete',
      demographicFit: 'Age groups affect only categories they can reasonably influence. Ethnicity can make a small cuisine-affinity adjustment, but it never stands in for religion. Restricted products need explicit religion or strong local-market evidence.',
      scoreWeights: { demandScale: 0.23, marketGap: 0.25, fairShare: 0.18, householdIncome: 0.12, competition: 0.12, evidenceQuality: 0.1 },
      disclaimer: 'The opportunity index is a comparative planning score, not a probability of success. It is capped by evidence quality and must be validated before investment.',
    },
    sources: [
      ...statistics.sources,
      { name: 'OpenStreetMap live business features', url: 'https://www.openstreetmap.org/copyright' },
    ],
  }
}

export function buildDetailedReport(analysis) {
  return {
    ...analysis,
    sensitivity: [
      { scenario: 'Conservative', demandChange: -20, topOpportunitySalesRm: Math.round(analysis.opportunities[0].fairShareSalesRm * 0.8) },
      { scenario: 'Base', demandChange: 0, topOpportunitySalesRm: analysis.opportunities[0].fairShareSalesRm },
      { scenario: 'Optimistic', demandChange: 20, topOpportunitySalesRm: Math.round(analysis.opportunities[0].fairShareSalesRm * 1.2) },
    ],
    competitorValidation: analysis.opportunities.map((opportunity) => ({
      category: opportunity.name,
      mappedCount: opportunity.observedCompetitors,
      adjustedCount: opportunity.adjustedCompetitors,
      modelledCount: opportunity.estimatedCompetitors,
      googleMapsSearch: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(opportunity.mapSearchQuery)}`,
      checks: ['Count relevant businesses in the study radius', 'Record rating and review volume', 'Remove closed or mismatched listings'],
    })),
    nextSteps: [
      'Validate pedestrian and vehicle traffic for shortlisted streets.',
      'Request commercial rental and floor-area data from a local property agent.',
      'Run site-level capture-rate and gravity modelling before signing a lease.',
    ],
  }
}
