import 'dotenv/config'
import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import * as database from './db.js'
import { getBenchmarks } from './benchmarks.js'
import { resolveCoordinates, resolveLocation } from './services/location.js'
import { getAreaStatistics } from './services/malaysiaData.js'
import { getNearbyBusinesses } from './services/openMarket.js'
import { buildAnalysis, buildDetailedReport } from './services/analysis.js'
import { singleFlight, TtlLruCache } from './services/runtimeCache.js'

const app = express()
const port = Number(process.env.PORT || 8787)
const host = process.env.HOST || '127.0.0.1'
const analysisCacheSeconds = Math.max(30, Number(process.env.ANALYSIS_RESULT_CACHE_SECONDS || 300))
const analysisResultCache = new TtlLruCache(process.env.ANALYSIS_MEMORY_CACHE_MAX_ENTRIES || 48)

if (/^(1|true)$/i.test(process.env.TRUST_PROXY || '')) app.set('trust proxy', 1)
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || ['http://localhost:5173'] }))
app.use(express.json({ limit: '100kb' }))
app.use('/api', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }))
const analysisLimiter = rateLimit({
  windowMs: Math.max(60_000, Number(process.env.ANALYSIS_RATE_WINDOW_MS || 600_000)),
  limit: Math.max(5, Number(process.env.ANALYSIS_RATE_LIMIT || 30)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many market scans from this connection. Please wait before trying again.' },
})

app.get('/api/health', async (_request, response) => {
  const databaseResult = await database.tryQuery('SELECT NOW() AS now')
  response.json({
    status: 'ok',
    database: databaseResult ? 'connected' : 'not-configured',
    malaysiaOpenData: 'configured',
    googleMaps: process.env.VITE_GOOGLE_MAPS_EMBED_API_KEY ? 'embed-configured' : 'embed-key-required',
    openMarketData: 'openstreetmap-with-postgres-cache',
  })
})

const analysisInput = z.object({
  query: z.string().trim().min(2).max(160).optional(),
  lat: z.coerce.number().min(0.8).max(7.6).optional(),
  lng: z.coerce.number().min(99.5).max(119.5).optional(),
  radiusKm: z.coerce.number().min(1).max(20).default(5),
  refresh: z.boolean().optional().default(false),
}).superRefine((value, context) => {
  const hasQuery = Boolean(value.query)
  const hasCoordinates = value.lat !== undefined && value.lng !== undefined
  if (!hasQuery && !hasCoordinates) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a place or select a point on the map' })
  }
  if ((value.lat === undefined) !== (value.lng === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Both latitude and longitude are required' })
  }
})

const analysisCacheKey = (input) => input.query
  ? `query:${input.query.toLowerCase().replace(/\s+/g, ' ').trim()}:r${input.radiusKm}`
  : `point:${Number(input.lat).toFixed(4)}:${Number(input.lng).toFixed(4)}:r${input.radiusKm}`

async function runAnalysis(input) {
  const key = analysisCacheKey(input)
  const cached = input.refresh ? null : analysisResultCache.get(key)
  if (cached) return { ...cached.result, runtimeCache: 'hit' }

  return singleFlight(`analysis:${key}${input.refresh ? ':refresh' : ''}`, async () => {
    const cachedDuringWait = input.refresh ? null : analysisResultCache.get(key)
    if (cachedDuringWait) return { ...cachedDuringWait.result, runtimeCache: 'hit' }

    const [location, benchmarks] = await Promise.all([
      input.lat !== undefined
        ? resolveCoordinates(input.lat, input.lng)
        : resolveLocation(input.query),
      getBenchmarks(database),
    ])
    const [statistics, market] = await Promise.all([
      getAreaStatistics(location),
      getNearbyBusinesses(location, input.radiusKm * 1000, benchmarks, { forceRefresh: input.refresh }),
    ])
    const complete = buildAnalysis({ location, statistics, market, benchmarks, radiusKm: input.radiusKm })
    const result = {
      fullResult: buildDetailedReport(complete),
      runtimeCache: 'miss',
    }
    if (complete.dataQuality.supplyAvailable) {
      analysisResultCache.set(key, {
        result,
        expiresAt: Date.now() + analysisCacheSeconds * 1000,
      })
    }
    return result
  })
}

app.post('/api/analysis/free', analysisLimiter, async (request, response, next) => {
  const startedAt = performance.now()
  try {
    const input = analysisInput.parse(request.body)
    const { fullResult, runtimeCache } = await runAnalysis(input)
    const durationMs = Math.round(performance.now() - startedAt)
    response.set('Cache-Control', 'no-store')
    response.set('Server-Timing', `analysis;dur=${durationMs};desc="${runtimeCache}"`)
    response.json({
      analysisId: crypto.randomUUID(),
      access: 'free-ad-supported',
      reportLocked: false,
      monetization: 'advertising',
      persistence: 'ephemeral',
      performance: { serverMs: durationMs, runtimeCache },
      ...fullResult,
    })
  } catch (error) {
    next(error)
  }
})

app.use((error, _request, response, _next) => {
  if (error instanceof z.ZodError) {
    return response.status(400).json({ error: 'Invalid request', details: error.flatten() })
  }
  if (!error.statusCode || error.statusCode >= 500) console.error(error)
  response
    .status(error.statusCode || 500)
    .json({
      error: error.message || 'Unexpected server error',
      ...(error.code ? { code: error.code } : {}),
    })
})

const server = app.listen(port, host, () => {
  console.log(`LaunchBase API listening on http://${host}:${port}`)
})

let shuttingDown = false
const shutdown = (signal) => {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received; finishing active requests`)
  server.close(async () => {
    await database.pool?.end().catch(() => {})
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 15_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
