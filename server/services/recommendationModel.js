const EARTH_RADIUS_KM = 6371.0088

export const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum)

export function haversineDistanceKm(origin, destination) {
  const lat1 = Number(origin?.lat)
  const lng1 = Number(origin?.lng)
  const lat2 = Number(destination?.lat)
  const lng2 = Number(destination?.lng)
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null

  const radians = (degrees) => degrees * Math.PI / 180
  const deltaLat = radians(lat2 - lat1)
  const deltaLng = radians(lng2 - lng1)
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function distanceDecay(distanceKm, radiusKm, halfDistanceRatio = 0.45) {
  if (!Number.isFinite(distanceKm)) return 1
  const halfDistanceKm = Math.max(0.25, Number(radiusKm || 1) * halfDistanceRatio)
  return Math.exp(-Math.log(2) * Math.max(0, distanceKm) / halfDistanceKm)
}

function mappedAttractiveness() {
  // Public map completeness is not evidence that one store attracts more
  // customers than another. Keep attractiveness neutral until floor area,
  // transactions, or another validated attraction variable is available.
  return 1
}

export function spatialSupplyWeight(place, {
  center,
  radiusKm,
  similarity = 1,
} = {}) {
  const distanceKm = haversineDistanceKm(center, place)
  const decay = distanceDecay(distanceKm, radiusKm)
  return {
    distanceKm,
    decay,
    attractiveness: mappedAttractiveness(place),
    equivalent: clamp(Number(similarity) || 0, 0, 1) * decay * mappedAttractiveness(place),
  }
}

export function predictionRange({
  demand,
  adjustedSupply,
  marketEvidence,
  historicallyValidated = false,
  spatialPopulationIsEstimated = true,
}) {
  const evidenceScore = clamp(Number(marketEvidence?.score || 0), 0, 100)
  const populationError = spatialPopulationIsEstimated ? 0.3 : 0.12
  const benchmarkError = historicallyValidated ? 0.18 : 0.4
  const supplyError = 0.15 + (1 - evidenceScore / 100) * 0.45
  const relativeError = clamp(
    Math.sqrt(populationError ** 2 + benchmarkError ** 2 + supplyError ** 2),
    0.25,
    0.8,
  )
  const demandLow = Math.max(0, demand * (1 - relativeError))
  const demandHigh = demand * (1 + relativeError)
  const supplyLow = Math.max(0, adjustedSupply * (1 - supplyError))
  const supplyHigh = adjustedSupply * (1 + supplyError)

  return {
    confidence: historicallyValidated ? 'model-informed' : 'planning-range',
    relativeUncertainty: Number(relativeError.toFixed(2)),
    demandLowRm: Math.round(demandLow),
    demandHighRm: Math.round(demandHigh),
    fairShareLowRm: Math.round(demandLow / (supplyHigh + 1)),
    fairShareHighRm: Math.round(demandHigh / (supplyLow + 1)),
    drivers: [
      ...(spatialPopulationIsEstimated ? ['district population is allocated to the scan radius'] : []),
      ...(!historicallyValidated ? ['category spending and store-sales benchmarks are not outcome-calibrated'] : []),
      ...(evidenceScore < 75 ? ['mapped supply coverage is incomplete'] : []),
    ],
  }
}

export function evidenceTier({ validation, localOutcomeCount = 0, marketEvidence, directCount = 0 }) {
  if (validation?.status === 'passed' && Number(validation?.sampleSize) > 0) {
    if (localOutcomeCount > 0) {
      return {
        level: 'locally-tested',
        label: 'Locally tested',
        description: 'Historical outcome validation includes observations from this local market.',
      }
    }
    return {
      level: 'historically-calibrated',
      label: 'Historically calibrated',
      description: 'This category has a recorded passing out-of-sample validation run.',
    }
  }
  if (marketEvidence?.level === 'low' || directCount < 2) {
    return {
      level: 'estimated',
      label: 'Estimated only',
      description: 'Public demographic and mapped-supply priors only; no passing outcome validation is available.',
    }
  }
  return {
    level: 'public-evidence',
    label: 'Public evidence screening',
    description: 'Supported by public area and mapped-market evidence, but not by verified store outcomes.',
  }
}

export function recommendationDecision({
  supplyAvailable,
  marketEvidence,
  directCount,
  culturalEligibility = true,
  validation,
}) {
  if (!culturalEligibility) {
    return {
      status: 'withheld',
      reason: 'The concept failed an explicit suitability constraint.',
      canRank: false,
    }
  }
  if (!supplyAvailable || Number(marketEvidence?.score || 0) < 20) {
    return {
      status: 'insufficient-evidence',
      reason: 'Usable mapped supply evidence is unavailable. Any ordering would be dominated by unvalidated priors.',
      canRank: false,
    }
  }
  if (directCount === 0 && marketEvidence?.level !== 'high') {
    return {
      status: 'insufficient-category-evidence',
      reason: 'No direct mapped example was found and market coverage is not strong enough to interpret that as a gap.',
      canRank: false,
    }
  }
  if (validation?.status === 'passed') {
    return {
      status: 'validated-screening',
      reason: 'The category has a passing historical validation record; the selected site still requires local testing.',
      canRank: true,
    }
  }
  return {
    status: 'screening-only',
    reason: 'This is a public-data planning comparison, not a calibrated probability of business success.',
    canRank: true,
  }
}
