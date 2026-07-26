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
const userAgent = process.env.OSM_USER_AGENT || 'LaunchBaseSearch/1.0 (local market analysis application)'
const normalizationVersion = 2

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

export function buildOverpassMarketQuery({ radius, lat, lng }) {
  const amenityPattern = [...new Set([...foodAmenities, ...commercialAmenityValues])].join('|')
  const leisurePattern = commercialLeisureValues.join('|')
  const tourismPattern = commercialTourismValues.join('|')
  return `[out:json][timeout:20];
(
  nwr(around:${radius},${lat},${lng})["shop"];
  nwr(around:${radius},${lat},${lng})["craft"];
  nwr(around:${radius},${lat},${lng})["office"]["office"!~"^(government|ngo|political_party|religion)$"];
  nwr(around:${radius},${lat},${lng})["healthcare"];
  nwr(around:${radius},${lat},${lng})["amenity"~"^(${amenityPattern})$"];
  nwr(around:${radius},${lat},${lng})["leisure"~"^(${leisurePattern})$"];
  nwr(around:${radius},${lat},${lng})["tourism"~"^(${tourismPattern})$"];
);
out center tags qt;`
}

async function fetchAndCacheMarket({ cacheKey, radius, roundedLat, roundedLng }) {
  const query = buildOverpassMarketQuery({
    radius,
    lat: roundedLat,
    lng: roundedLng,
  })

  let body
  let successfulEndpoint
  let emptyResponse
  const errors = []
  const requestStartedAt = Date.now()
  for (const endpoint of OVERPASS_URLS) {
    const remainingMs = totalTimeoutMs - (Date.now() - requestStartedAt)
    if (remainingMs < 1000) {
      errors.push(`total request budget of ${totalTimeoutMs}ms was exhausted`)
      break
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': userAgent,
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remainingMs)),
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

  const places = normalizeMarketPlaces(body.elements || [])
  const payload = {
    provider: 'openstreetmap-overpass',
    endpoint: successfulEndpoint,
    fetchedAt: new Date().toISOString(),
    radiusMeters: radius,
    normalizationVersion,
    places,
  }
  await writeExternalCache(cacheKey, payload, 'openstreetmap-overpass', cacheSeconds)
  return { ...payload, cacheStatus: 'database-refreshed' }
}

export async function getNearbyBusinesses(location, radiusMeters, _benchmarks) {
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
  if (cached?.fresh) return {
    ...cached.payload,
    places: cachedPlaces(cached.payload),
    cacheStatus: 'database-hit',
  }

  const refresh = () => fetchAndCacheMarket({ cacheKey, radius, roundedLat, roundedLng })
  const staleIsUsable = cached
    && Number.isFinite(cached.expiresAt)
    && Date.now() - cached.expiresAt <= staleMaxMs

  if (staleIsUsable) {
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
