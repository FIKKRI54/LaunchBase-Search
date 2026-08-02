import * as database from '../db.js'
import { readExternalCache, writeExternalCache } from './externalCache.js'
import {
  canonicalizeGovernmentArea,
  isKnownGovernmentDistrict,
} from './governmentAreas.js'
import { runInBackground, singleFlight, TtlLruCache } from './runtimeCache.js'

const NOMINATIM_URL = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_REVERSE_URL = process.env.NOMINATIM_REVERSE_URL || 'https://nominatim.openstreetmap.org/reverse'
const userAgent = process.env.OSM_USER_AGENT || 'LaunchBaseSearch/1.0 (local market analysis application)'
const geocodeCacheSeconds = Math.max(1, Number(process.env.GEOCODE_CACHE_DAYS || 180)) * 24 * 60 * 60
const geocodeStaleMaxMs = Math.max(1, Number(process.env.GEOCODE_STALE_MAX_DAYS || 365)) * 24 * 60 * 60 * 1000
const districtCache = new TtlLruCache(32)

export class MalaysiaLocationError extends Error {
  constructor(message = 'LaunchBase currently supports locations within Malaysia only') {
    super(message)
    this.name = 'MalaysiaLocationError'
    this.code = 'MALAYSIA_ONLY'
    this.statusCode = 400
  }
}

const knownLocations = [
  { terms: ['kuala lumpur', 'klcc'], name: 'Kuala Lumpur', district: 'W.P. Kuala Lumpur', state: 'W.P. Kuala Lumpur', lat: 3.139, lng: 101.6869 },
  { terms: ['johor bahru', 'jb'], name: 'Johor Bahru', district: 'Johor Bahru', state: 'Johor', lat: 1.4927, lng: 103.7414 },
  { terms: ['george town', 'penang'], name: 'George Town', district: 'Timur Laut', state: 'Pulau Pinang', lat: 5.4141, lng: 100.3288 },
  { terms: ['shah alam'], name: 'Shah Alam', district: 'Petaling', state: 'Selangor', lat: 3.0738, lng: 101.5183 },
  { terms: ['petaling jaya', 'pj'], name: 'Petaling Jaya', district: 'Petaling', state: 'Selangor', lat: 3.1073, lng: 101.6067 },
  { terms: ['kota kinabalu'], name: 'Kota Kinabalu', district: 'Kota Kinabalu', state: 'Sabah', lat: 5.9804, lng: 116.0735 },
  { terms: ['kuching'], name: 'Kuching', district: 'Kuching', state: 'Sarawak', lat: 1.5533, lng: 110.3592 },
]

const malaysiaStates = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Perak', 'Perlis', 'Pulau Pinang', 'Penang', 'Sabah', 'Sarawak',
  'Selangor', 'Terengganu', 'Kuala Lumpur', 'Putrajaya', 'Labuan',
]

const normalize = (value = '') => value
  .toLowerCase()
  .replace(/\b(district|daerah|jajahan|bahagian|division)\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

let nominatimQueue = Promise.resolve()
let lastNominatimRequest = 0

function scheduleNominatimRequest(task) {
  const run = async () => {
    const waitMs = Math.max(0, 1100 - (Date.now() - lastNominatimRequest))
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs))
    lastNominatimRequest = Date.now()
    return task()
  }
  const request = nominatimQueue.then(run, run)
  nominatimQueue = request.catch(() => {})
  return request
}

async function matchGovernmentDistrict(address, rawState) {
  const state = canonicalizeGovernmentArea({ district: '', state: rawState }).state
  const candidates = [
    address.city_district,
    address.district,
    address.county,
    address.municipality,
    address.city,
    address.town,
  ].filter(Boolean)
  const canonicalCandidates = candidates.map((district) =>
    canonicalizeGovernmentArea({ district, state }),
  )

  const districtCacheKey = normalize(state) || 'all'
  let districts = districtCache.get(districtCacheKey)?.rows
  if (!districts) {
    const result = await database.tryQuery(
      `SELECT DISTINCT district, state
       FROM area_statistics
       WHERE dataset_id = 'population_district'
         AND ($1 = '' OR LOWER(state) = LOWER($1))`,
      [state],
    )
    districts = result?.rows || []
    districtCache.set(districtCacheKey, {
      rows: districts,
      expiresAt: Date.now() + 60 * 60 * 1000,
    })
  }
  for (const candidate of canonicalCandidates) {
    const normalizedCandidate = normalize(candidate.district)
    const exact = districts.find((row) => normalize(row.district) === normalizedCandidate)
    if (exact) return exact
  }

  // English Penang geocoder labels do not match DOSM's Malay district labels.
  // Resolve an authoritative alias before fuzzy matching, including when this
  // is the first scan and the database has not cached the DOSM snapshot yet.
  const knownCandidate = canonicalCandidates.find(isKnownGovernmentDistrict)
  if (knownCandidate) return knownCandidate

  for (const candidate of canonicalCandidates) {
    const normalizedCandidate = normalize(candidate.district)
    const partial = districts.find((row) => {
      const district = normalize(row.district)
      return district.includes(normalizedCandidate) || normalizedCandidate.includes(district)
    })
    if (partial) return partial
  }

  return canonicalCandidates[0] || canonicalizeGovernmentArea({ district: state, state })
}

function withStateSeparator(searchQuery) {
  const state = malaysiaStates.find((name) =>
    new RegExp(`\\b${name.replace(' ', '\\s+')}\\b`, 'i').test(searchQuery),
  )
  if (!state) return searchQuery
  const place = searchQuery.replace(new RegExp(`\\b${state.replace(' ', '\\s+')}\\b`, 'ig'), '').trim()
  return place ? `${place}, ${state}` : state
}

async function requestNominatim(query) {
  const url = new URL(NOMINATIM_URL)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', /\bmalaysia\b/i.test(query) ? query : `${query}, Malaysia`)
  url.searchParams.set('countrycodes', 'my')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('limit', '5')

  const response = await scheduleNominatimRequest(() => fetch(url, {
    headers: {
      'User-Agent': userAgent,
      'Accept-Language': 'en-MY,en;q=0.9,ms;q=0.8',
    },
    signal: AbortSignal.timeout(12000),
  }))
  if (!response.ok) throw new Error(`Location search failed (${response.status})`)
  return response.json()
}

export function chooseBestLocationResult(results, searchQuery) {
  const queryTokens = normalize(searchQuery)
    .replace(/\bsection\b/g, 'seksyen')
    .split(' ')
    .filter((token) => token.length > 1 && token !== 'malaysia')
  return [...results].sort((left, right) => {
    const score = (result) => {
      const candidate = normalize(`${result.name || ''} ${result.display_name || ''}`)
        .replace(/\bsection\b/g, 'seksyen')
      const tokenMatches = queryTokens.filter((token) => candidate.includes(token)).length
      const exactName = normalize(result.name || '').replace(/\bsection\b/g, 'seksyen')
        === normalize(searchQuery).replace(/\bsection\b/g, 'seksyen')
      return tokenMatches * 4 + (exactName ? 8 : 0)
    }
    return score(right) - score(left)
  })[0]
}

export function isMalaysianLocationResult(result) {
  return String(result?.address?.country_code || result?.country_code || '').toLowerCase() === 'my'
}

export function getBroadLocationDefault(searchQuery) {
  const broadQuery = normalize(searchQuery)
    .replace(/\bmalaysia\b/g, '')
    .replace(/\bstate\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (broadQuery !== 'penang' && broadQuery !== 'pulau pinang') return null

  const georgeTown = knownLocations.find((location) => location.name === 'George Town')
  return {
    ...georgeTown,
    formattedAddress: 'George Town, Timur Laut, Pulau Pinang, Malaysia',
    countryCode: 'my',
    provider: 'local-region-default',
    approximate: true,
    cacheStatus: 'regional-centre-default',
    warning: 'Pulau Pinang is a state, so this scan is centred on George Town. Click the map to choose a more exact area.',
  }
}

async function locationFromReverseResult(result, fallbackName) {
  if (!isMalaysianLocationResult(result)) throw new MalaysiaLocationError()
  const address = result.address || {}
  const districtMatch = await matchGovernmentDistrict(address, address.state || '')
  const localityAddress = [
    address.neighbourhood,
    address.suburb,
    address.quarter,
    address.village,
    address.town,
    address.city,
    address.district,
    address.state,
    address.postcode,
    address.country,
  ].filter((value, index, values) => value && values.indexOf(value) === index)
  return {
    name: address.neighbourhood
      || address.suburb
      || address.quarter
      || address.village
      || address.town
      || address.city
      || result.name
      || fallbackName,
    formattedAddress: localityAddress.join(', ') || result.display_name,
    district: districtMatch.district,
    state: districtMatch.state,
    lat: Number(result.lat),
    lng: Number(result.lon),
    countryCode: 'my',
    provider: 'openstreetmap-nominatim',
    approximate: false,
    attribution: '© OpenStreetMap contributors',
  }
}

async function geocodeMalaysia(searchQuery) {
  const separatedQuery = withStateSeparator(searchQuery)
  const localisedQuery = separatedQuery.replace(/\bsection\s*(\d+[a-z]?)\b/ig, 'Seksyen $1')
  const queryAttempts = [
    localisedQuery,
    separatedQuery,
    separatedQuery.replace(/\btumbuh\b/ig, 'Tumboh'),
  ].filter((query, index, values) => values.indexOf(query) === index)

  let result
  for (const query of queryAttempts) {
    const results = await requestNominatim(query)
    if (results[0]) {
      result = chooseBestLocationResult(results, searchQuery)
      break
    }
  }
  if (!result) throw new MalaysiaLocationError(`No location in Malaysia was found for "${searchQuery}"`)
  if (!isMalaysianLocationResult(result)) throw new MalaysiaLocationError()

  const address = result.address || {}
  const districtMatch = await matchGovernmentDistrict(address, address.state || '')
  return {
    name: address.neighbourhood || address.suburb || address.quarter || address.village || result.name || address.town || address.city || searchQuery,
    formattedAddress: [
      address.neighbourhood,
      address.suburb,
      address.quarter,
      address.village,
      address.town,
      address.city,
      address.district,
      address.state,
      address.postcode,
      address.country,
    ].filter((value, index, values) => value && values.indexOf(value) === index).join(', ') || result.display_name,
    district: districtMatch.district,
    state: districtMatch.state,
    lat: Number(result.lat),
    lng: Number(result.lon),
    countryCode: 'my',
    provider: 'openstreetmap-nominatim',
    approximate: false,
    attribution: '© OpenStreetMap contributors',
  }
}

export async function resolveLocation(searchQuery) {
  const broadLocationDefault = getBroadLocationDefault(searchQuery)
  if (broadLocationDefault) return broadLocationDefault

  const normalizedQuery = normalize(searchQuery)
  const cacheKey = `geocode:v6:my:${normalizedQuery}`
  const cached = await readExternalCache(cacheKey, { allowExpired: true })
  if (cached?.fresh) return { ...cached.payload, cacheStatus: 'database-hit' }

  const refresh = async () => {
    const location = await geocodeMalaysia(searchQuery)
    await writeExternalCache(cacheKey, location, 'openstreetmap-nominatim', geocodeCacheSeconds)
    return { ...location, cacheStatus: 'database-refreshed' }
  }
  const staleIsUsable = cached
    && Number.isFinite(cached.expiresAt)
    && Date.now() - cached.expiresAt <= geocodeStaleMaxMs
  if (staleIsUsable) {
    runInBackground(`geocode-refresh:${cacheKey}`, refresh)
    return {
      ...cached.payload,
      cacheStatus: 'database-stale-refreshing',
      warning: 'Refreshing this location in the background',
    }
  }

  try {
    return await singleFlight(`geocode:${cacheKey}`, refresh)
  } catch (error) {
    if (cached) return { ...cached.payload, cacheStatus: 'database-stale', warning: error.message }

    const match = knownLocations.find((location) =>
      location.terms.some((term) => normalizedQuery.includes(term)),
    )
    if (!match) throw error
    return {
      ...match,
      formattedAddress: `${match.name}, Malaysia`,
      countryCode: 'my',
      provider: 'local-location-index',
      approximate: true,
      cacheStatus: 'built-in-fallback',
      warning: error.message,
    }
  }
}

export async function resolveCoordinates(lat, lng) {
  const latitude = Number(lat)
  const longitude = Number(lng)
  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < 0.8
    || latitude > 7.6
    || longitude < 99.5
    || longitude > 119.5
  ) {
    throw new MalaysiaLocationError('Select a point within Malaysia')
  }

  const roundedLat = latitude.toFixed(5)
  const roundedLng = longitude.toFixed(5)
  const cacheKey = `reverse-geocode:v3:my:${roundedLat}:${roundedLng}`
  const cached = await readExternalCache(cacheKey, { allowExpired: true })
  if (cached?.fresh) return { ...cached.payload, cacheStatus: 'database-hit' }

  const refresh = async () => {
    const url = new URL(NOMINATIM_REVERSE_URL)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', roundedLat)
    url.searchParams.set('lon', roundedLng)
    url.searchParams.set('zoom', '16')
    url.searchParams.set('addressdetails', '1')
    const response = await scheduleNominatimRequest(() => fetch(url, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'en-MY,en;q=0.9,ms;q=0.8',
      },
      signal: AbortSignal.timeout(12000),
    }))
    if (!response.ok) throw new Error(`Map point lookup failed (${response.status})`)
    const result = await response.json()
    if (result.error || !isMalaysianLocationResult(result)) {
      throw new MalaysiaLocationError('Select a point within Malaysia')
    }
    const location = await locationFromReverseResult(result, `${roundedLat}, ${roundedLng}`)
    await writeExternalCache(cacheKey, location, 'openstreetmap-nominatim-reverse', geocodeCacheSeconds)
    return { ...location, cacheStatus: 'database-refreshed' }
  }
  const staleIsUsable = cached
    && Number.isFinite(cached.expiresAt)
    && Date.now() - cached.expiresAt <= geocodeStaleMaxMs
  if (staleIsUsable) {
    runInBackground(`reverse-geocode-refresh:${cacheKey}`, refresh)
    return {
      ...cached.payload,
      cacheStatus: 'database-stale-refreshing',
      warning: 'Refreshing this map point in the background',
    }
  }

  try {
    return await singleFlight(`reverse-geocode:${cacheKey}`, refresh)
  } catch (error) {
    if (cached) return { ...cached.payload, cacheStatus: 'database-stale', warning: error.message }
    throw error
  }
}
