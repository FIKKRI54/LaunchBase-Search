function finite(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function regressionMetrics(rows, {
  actualField = 'actual',
  predictionField = 'prediction',
} = {}) {
  const usable = rows
    .map((row) => ({ actual: finite(row[actualField]), prediction: finite(row[predictionField]) }))
    .filter((row) => row.actual !== null && row.prediction !== null)
  if (!usable.length) return { count: 0, mae: null, rmse: null, wape: null }

  const absoluteErrors = usable.map((row) => Math.abs(row.prediction - row.actual))
  const squaredErrors = usable.map((row) => (row.prediction - row.actual) ** 2)
  const actualTotal = usable.reduce((sum, row) => sum + Math.abs(row.actual), 0)
  return {
    count: usable.length,
    mae: absoluteErrors.reduce((sum, value) => sum + value, 0) / usable.length,
    rmse: Math.sqrt(squaredErrors.reduce((sum, value) => sum + value, 0) / usable.length),
    wape: actualTotal > 0
      ? absoluteErrors.reduce((sum, value) => sum + value, 0) / actualTotal
      : null,
  }
}

export function probabilityMetrics(rows, {
  actualField = 'actual',
  probabilityField = 'probability',
  bins = 10,
} = {}) {
  const usable = rows
    .map((row) => ({ actual: finite(row[actualField]), probability: finite(row[probabilityField]) }))
    .filter((row) => row.actual !== null && [0, 1].includes(row.actual)
      && row.probability !== null && row.probability >= 0 && row.probability <= 1)
  if (!usable.length) return { count: 0, brier: null, calibrationError: null }

  const brier = usable.reduce((sum, row) => sum + (row.probability - row.actual) ** 2, 0) / usable.length
  let weightedCalibrationError = 0
  for (let index = 0; index < bins; index += 1) {
    const minimum = index / bins
    const maximum = (index + 1) / bins
    const bucket = usable.filter((row) => row.probability >= minimum
      && (index === bins - 1 ? row.probability <= maximum : row.probability < maximum))
    if (!bucket.length) continue
    const predicted = bucket.reduce((sum, row) => sum + row.probability, 0) / bucket.length
    const observed = bucket.reduce((sum, row) => sum + row.actual, 0) / bucket.length
    weightedCalibrationError += Math.abs(predicted - observed) * bucket.length / usable.length
  }
  return { count: usable.length, brier, calibrationError: weightedCalibrationError }
}

export function intervalMetrics(rows, {
  actualField = 'actual',
  lowerField = 'lower',
  upperField = 'upper',
} = {}) {
  const usable = rows
    .map((row) => ({
      actual: finite(row[actualField]),
      lower: finite(row[lowerField]),
      upper: finite(row[upperField]),
    }))
    .filter((row) => row.actual !== null && row.lower !== null && row.upper !== null && row.lower <= row.upper)
  if (!usable.length) return { count: 0, coverage: null, meanWidth: null }

  return {
    count: usable.length,
    coverage: usable.filter((row) => row.actual >= row.lower && row.actual <= row.upper).length / usable.length,
    meanWidth: usable.reduce((sum, row) => sum + row.upper - row.lower, 0) / usable.length,
  }
}

export function spatialTemporalSplits(rows, {
  cutoff,
  spatialField = 'district',
  timeField = 'observationMonth',
  heldOutAreas = [],
} = {}) {
  const cutoffTime = new Date(cutoff).getTime()
  if (!Number.isFinite(cutoffTime)) throw new Error('A valid temporal cutoff is required')
  const heldOut = new Set(heldOutAreas.map((value) => String(value).toLowerCase()))
  const beforeCutoff = (row) => new Date(row[timeField]).getTime() < cutoffTime
  const inHeldOutArea = (row) => heldOut.has(String(row[spatialField] || '').toLowerCase())

  return {
    temporal: {
      train: rows.filter(beforeCutoff),
      test: rows.filter((row) => !beforeCutoff(row)),
    },
    spatial: {
      train: rows.filter((row) => !inHeldOutArea(row)),
      test: rows.filter(inHeldOutArea),
    },
    strict: {
      train: rows.filter((row) => beforeCutoff(row) && !inHeldOutArea(row)),
      test: rows.filter((row) => !beforeCutoff(row) && inHeldOutArea(row)),
    },
  }
}

export function validationGate({
  model,
  baseline,
  interval,
  minimumHoldout = 30,
  targetCoverage = 0.8,
  coverageTolerance = 0.05,
} = {}) {
  if (!model || model.count < minimumHoldout) {
    return { status: 'candidate', reason: `At least ${minimumHoldout} usable holdout observations are required.` }
  }
  if (!baseline || !Number.isFinite(model.wape) || !Number.isFinite(baseline.wape)) {
    return { status: 'candidate', reason: 'Comparable model and baseline WAPE metrics are required.' }
  }
  if (model.wape >= baseline.wape) {
    return { status: 'failed', reason: 'The model did not outperform the declared baseline on the holdout set.' }
  }
  if (interval?.coverage !== null && interval?.coverage < targetCoverage - coverageTolerance) {
    return { status: 'failed', reason: 'Prediction interval coverage missed the declared target beyond tolerance.' }
  }
  return { status: 'passed', reason: 'The model beat the declared baseline and met the configured holdout checks.' }
}
