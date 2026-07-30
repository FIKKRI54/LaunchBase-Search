import { readExternalCache, writeExternalCache } from './externalCache.js'
import { classifyBusiness } from './marketClassifier.js'
import { runInBackground, singleFlight } from './runtimeCache.js'
import {
  commercialAmenityValues,
  commercialLeisureValues,
  commercialTourismValues,
} from './marketTaxonomy.js'

const OVERPASS_URLS = (process.env.OVERPASS_API_URLS || [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass-api.de/api/interpreter',
].join(',')).split(',').map((url) => url.trim()).filter(Boolean)
const cacheHours = Math.max(1, Number(process.env.MARKET_DATA_CACHE_HOURS || 24))
const cacheSeconds = cacheHours * 60 * 60
const staleMaxMs = Math.max(1, Number(process.env.MARKET_STALE_MAX_DAYS || 30)) * 24 * 60 * 60 * 1000
const requestTimeoutMs = Math.min(45_000, Math.max(5_000, Number(process.env.OVERPASS_TIMEOUT_MS || 18_000)))
const totalTimeoutMs = Math.min(90_000, Math.max(requestTimeoutMs, Number(process.env.OVERPASS_TOTAL_TIMEOUT_MS || 32_000)))
const cacheCoordinatePrecision = Math.min(4, Math.max(2, Number(process.env.MARKET_CACHE_COORDINATE_PRECISION || 3)))
const denseScanRadiusMeters = Math.min(10_000, Math.max(3_000, Number(process.env.OVERPASS_DENSE_SCAN_RADIUS_METERS || 5_000)))
const userAgent = process.env.OSM_USER_AGENT || 'LaunchBaseSearch/1.0 (local market analysis application)'
const normalizationVersion = 2
const endpointQueues = new Map()

const splitTag = (filter) => {
  const separator = filter.indexOf('=')
  return [filter.slice(0, separator), filter.slice(separator + 1)]
}

export function matchesMarketTags(placeTags, filters = []) {
  return filters.some((filter) => {
    const [key, value] = splitTag(filter)
    return String(placeTags[key] || '').split(';').includes(value)
  })
}

const normalizedIdentity = (value = '') => String(value)
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '')

const distanceMeters = (a, b) => {
  const latScale = 111_320
  const lngScale = latScale * Math.cos(((Number(a.lat) + Number(b.lat)) / 2) * Math.PI / 180)
  const latDistance = (Number(a.lat) - Number(b.lat)) * latScale
  const lngDistance = (Number(a.lng) - Number(b.lng)) * lngScale
  return Math.hypot(latDistance, lngDistance)
}

export function normalizeMarketPlaces(elements = []) {
  const places = []
  const identityBuckets = new Map()
  for (const element of elements) {
    const rawId = String(element.id)
    const place = {
      id: rawId.includes('/') ? rawId : `${element.type}/${rawId}`,
      name: element.name || element.tags?.name || element.tags?.brand || element.tags?.operator || 'Unnamed mapped business',
      lat: Number(element.lat ?? element.center?.lat),
      lng: Number(element.lng ?? element.lon ?? element.center?.lon),
      tags: element.tags || {},
    }
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue

    const identity = normalizedIdentity(place.name)
    const candidates = identity ? identityBuckets.get(identity) || [] : []
    const duplicate = identity && place.name !== 'Unnamed mapped business'
      ? candidates.some((candidate) => distanceMeters(candidate, place) <= 40)
      : false
    if (duplicate) continue

    const normalized = { ...place, ...classifyBusiness(place) }
    places.push(normalized)
    if (identity) {
      candidates.push(normalized)
      identityBuckets.set(identity, candidates)
    }
  }
  return places
}

function cachedPlaces(payload) {
  return payload.normalizationVersion === normalizationVersion
    ? payload.places || []
    : normalizeMarketPlaces(payload.places)
}

const foodAmenities = ['cafe', 'restaurant', 'fast_food', 'food_court', 'ice_cream']

export function marketScanScopesForRadius(radius) {
  return Number(radius) >= denseScanRadiusMeters
    ? ['markers']
    : ['full', 'markers']
}

export function buildOverpassMarketQuery({ radius, lat, lng, scope = 'full' }) {
  const selector = scope === 'markers' ? 'node' : 'nwr'
  const amenityPattern = [...new Set([...foodAmenities, ...commercialAmenityValues])].join('|')
  const leisurePattern = commercialLeisureValues.join('|')
  const tourismPattern = commercialTourismValues.join('|')
  const focused = scope === 'focused' || scope === 'markers'
  const extendedQueries = focused
    ? `  ${selector}(around:${radius},${lat},${lng})["office"="coworking"];`
    : `  ${selector}(around:${radius},${lat},${lng})["office"]["office"!~"^(government|ngo|political_party|religion)$"];
  ${selector}(around:${radius},${lat},${lng})["tourism"~"^(${tourismPattern})$"];`
  const resourceSettings = scope === 'markers'
    ? '[out:json][timeout:18][maxsize:268435456]'
    : '[out:json][timeout:20]'
  return `${resourceSettings};
(
  ${selector}(around:${radius},${lat},${lng})["shop"];
  ${selector}(around:${radius},${lat},${lng})["craft"];
${extendedQueries}
  ${selector}(around:${radius},${lat},${lng})["healthcare"];
  ${selector}(around:${radius},${lat},${lng})["amenity"~"^(${amenityPattern})$"];
  ${selector}(around:${radius},${lat},${lng})["leisure"~"^(${leisurePattern})$"];
);
out center tags qt;`
}

function queryHash(value) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function distributeEndpoints(endpoints, query, enabled) {
  if (!enabled || endpoints.length < 2) return endpoints
  const offset = queryHash(query) % endpoints.length
  return [...endpoints.slice(offset), ...endpoints.slice(0, offset)]
}

// Serialize requests per public provider. Separate providers can still serve
// different scans concurrently without creating a same-IP request stampede.
function scheduleEndpointRequest(endpoint, task) {
  const previous = endpointQueues.get(endpoint) || Promise.resolve()
  const request = previous.catch(() => {}).then(task)
  const tail = request.catch(() => {}).finally(() => {
    if (endpointQueues.get(endpoint) === tail) endpointQueues.delete(endpoint)
  })
  endpointQueues.set(endpoint, tail)
  return request
}

export async function requestOverpass(query, {
  endpoints = OVERPASS_URLS,
  totalBudgetMs = totalTimeoutMs,
  perRequestTimeoutMs = requestTimeoutMs,
  fetchImpl = fetch,
  distribute = endpoints === OVERPASS_URLS,
} = {}) {
  let body
  let successfulEndpoint
  let emptyResponse
  const errors = []
  const requestStartedAt = Date.now()
  const orderedEndpoints = distributeEndpoints(endpoints, query, distribute)
  for (const endpoint of orderedEndpoints) {
    const remainingMs = totalBudgetMs - (Date.now() - requestStartedAt)
    if (remainingMs < 1000) {
      errors.push(`total request budget of ${totalBudgetMs}ms was exhausted`)
      break
    }
    try {
      const response = await scheduleEndpointRequest(endpoint, async () => {
        const requestRemainingMs = totalBudgetMs - (Date.now() - requestStartedAt)
        if (requestRemainingMs < 1000) throw new Error(`total request budget of ${totalBudgetMs}ms was exhausted while queued`)
        return fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'User-Agent': userAgent,
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(Math.min(perRequestTimeoutMs, requestRemainingMs)),
        })
      })
      if (!response.ok) throw new Error(`request failed (${response.status})`)
      const candidate = await response.json()
      if (!Array.isArray(candidate.elements)) throw new Error('response did not contain an elements array')
      if (candidate.elements.length === 0) {
        emptyResponse = { body: candidate, endpoint }
        errors.push(`${endpoint} returned an empty map response`)
        continue
      }
      body = candidate
      successfulEndpoint = endpoint
      break
    } catch (error) {
      errors.push(`${endpoint}: ${error.message}`)
    }
  }
  if (!body && emptyResponse) {
    body = emptyResponse.body
    successfulEndpoint = emptyResponse.endpoint
  }
  if (!body) throw new Error(`OpenStreetMap market request failed: ${errors.join('; ')}`)
  return { body, endpoint: successfulEndpoint, errors }
}

async function fetchAndCacheMarket({ cacheKey, radius, roundedLat, roundedLng }) {
  const [primaryScope] = marketScanScopesForRadius(radius)
  const useNodeFirst = primaryScope === 'markers'
  const primaryQuery = buildOverpassMarketQuery({
    radius,
    lat: roundedLat,
    lng: roundedLng,
    scope: primaryScope,
  })

  let response
  let scanScope = 'full'
  let warning
  try {
    response = await requestOverpass(primaryQuery)
    if (useNodeFirst) {
      scanScope = 'node-focused'
      warning = 'A high-density node scan was used to keep the live market responsive; mapped polygon businesses may be incomplete'
    }
  } catch (primaryError) {
    if (useNodeFirst) throw primaryError
    const markerQuery = buildOverpassMarketQuery({
      radius,
      lat: roundedLat,
      lng: roundedLng,
      scope: 'markers',
    })
    try {
      response = await requestOverpass(markerQuery, {
        totalBudgetMs: Math.min(totalTimeoutMs, 32_000),
        perRequestTimeoutMs: Math.min(requestTimeoutMs, 18_000),
      })
      scanScope = 'node-focused'
      warning = `The complete mapped-business query was unavailable (${primaryError.message}); using a high-density node scan`
    } catch (markerError) {
      throw new Error(`${primaryError.message}; node-marker retry also failed: ${markerError.message}`)
    }
  }

  const places = normalizeMarketPlaces(response.body.elements || [])
  const payload = {
    provider: 'openstreetmap-overpass',
    endpoint: response.endpoint,
    fetchedAt: new Date().toISOString(),
    radiusMeters: radius,
    scanScope,
    normalizationVersion,
    places,
    ...(warning ? { warning } : {}),
  }
  const payloadCacheSeconds = scanScope === 'full' ? cacheSeconds : Math.min(cacheSeconds, 6 * 60 * 60)
  await writeExternalCache(cacheKey, payload, 'openstreetmap-overpass', payloadCacheSeconds)
  return { ...payload, cacheStatus: 'database-refreshed' }
}

export async function getNearbyBusinesses(location, radiusMeters, _benchmarks, { forceRefresh = false } = {}) {
  const radius = Math.min(Math.max(Math.round(radiusMeters), 500), 10000)
  const roundedLat = Number(location.lat).toFixed(4)
  const roundedLng = Number(location.lng).toFixed(4)
  const cacheLat = Number(location.lat).toFixed(cacheCoordinatePrecision)
  const cacheLng = Number(location.lng).toFixed(cacheCoordinatePrecision)
  const cacheKey = `osm-market:v6:${cacheLat}:${cacheLng}:${radius}`
  let cached = await readExternalCache(cacheKey, { allowExpired: true })
  if (!cached) {
    const legacyKey = `osm-market:v5:${roundedLat}:${roundedLng}:${radius}`
    const legacy = await readExternalCache(legacyKey, { allowExpired: true })
    if (legacy) {
      const upgradedPayload = {
        ...legacy.payload,
        normalizationVersion,
        places: cachedPlaces(legacy.payload),
      }
      cached = { ...legacy, payload: upgradedPayload }
      if (legacy.fresh) {
        const remainingSeconds = Math.max(60, Math.round((legacy.expiresAt - Date.now()) / 1000))
        runInBackground(`market-cache-upgrade:${cacheKey}`, () =>
          writeExternalCache(cacheKey, upgradedPayload, 'openstreetmap-overpass', remainingSeconds))
      }
    }
  }
  if (cached?.fresh && !forceRefresh) return {
    ...cached.payload,
    places: cachedPlaces(cached.payload),
    cacheStatus: 'database-hit',
  }

  const refresh = () => fetchAndCacheMarket({ cacheKey, radius, roundedLat, roundedLng })
  const staleIsUsable = cached
    && Number.isFinite(cached.expiresAt)
    && Date.now() - cached.expiresAt <= staleMaxMs

  if (staleIsUsable && !forceRefresh) {
    runInBackground(`market:${cacheKey}`, refresh)
    return {
      ...cached.payload,
      places: cachedPlaces(cached.payload),
      cacheStatus: 'database-stale-refreshing',
      warning: 'Using the last stored market snapshot while a refresh runs in the background',
    }
  }

  try {
    return await singleFlight(`market:${cacheKey}`, refresh)
  } catch (error) {
    if (cached) {
      return {
        ...cached.payload,
        places: cachedPlaces(cached.payload),
        cacheStatus: 'database-stale',
        warning: `${error.message}; using the last stored market snapshot`,
      }
    }
    return {
      provider: 'modelled-fallback',
      fetchedAt: null,
      radiusMeters: radius,
      places: [],
      cacheStatus: 'unavailable',
      warning: `${error.message}; competitor counts use starter density assumptions`,
    }
  }
}
