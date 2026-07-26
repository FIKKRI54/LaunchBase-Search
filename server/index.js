import 'dotenv/config'
import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import * as database from './db.js'
import { createToken, optionalAuth } from './auth.js'
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
  const cached = analysisResultCache.get(key)
  if (cached) return { ...cached.result, runtimeCache: 'hit' }

  return singleFlight(`analysis:${key}`, async () => {
    const cachedDuringWait = analysisResultCache.get(key)
    if (cachedDuringWait) return { ...cachedDuringWait.result, runtimeCache: 'hit' }

    const [location, benchmarks] = await Promise.all([
      input.lat !== undefined
        ? resolveCoordinates(input.lat, input.lng)
        : resolveLocation(input.query),
      getBenchmarks(database),
    ])
    const [statistics, market] = await Promise.all([
      getAreaStatistics(location),
      getNearbyBusinesses(location, input.radiusKm * 1000, benchmarks),
    ])
    const complete = buildAnalysis({ location, statistics, market, benchmarks, radiusKm: input.radiusKm })
    const result = {
      fullResult: buildDetailedReport(complete),
      searchQuery: input.query || `${input.lat},${input.lng}`,
      runtimeCache: 'miss',
    }
    analysisResultCache.set(key, {
      result,
      expiresAt: Date.now() + (complete.dataQuality.supplyAvailable ? analysisCacheSeconds : 20) * 1000,
    })
    return result
  })
}

app.post('/api/analysis/free', analysisLimiter, optionalAuth, async (request, response, next) => {
  const startedAt = performance.now()
  try {
    const input = analysisInput.parse(request.body)
    const { fullResult, searchQuery, runtimeCache } = await runAnalysis(input)
    const fallbackId = crypto.randomUUID()
    const saved = request.user?.sub
      ? await database.tryQuery(
        `INSERT INTO analysis_runs
          (user_id, search_query, location, inputs, free_result, full_result, source_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          request.user.sub,
          searchQuery,
          fullResult.location,
          input,
          fullResult,
          fullResult,
          { sources: fullResult.sources, generatedAt: fullResult.generatedAt },
        ],
      )
      : null
    const durationMs = Math.round(performance.now() - startedAt)
    response.set('Cache-Control', 'no-store')
    response.set('Server-Timing', `analysis;dur=${durationMs};desc="${runtimeCache}"`)
    response.json({
      analysisId: saved?.rows?.[0]?.id || fallbackId,
      access: 'free-ad-supported',
      reportLocked: false,
      monetization: 'advertising',
      persistence: saved?.rows?.[0]?.id ? 'account-json-only' : 'ephemeral',
      performance: { serverMs: durationMs, runtimeCache },
      ...fullResult,
    })
  } catch (error) {
    next(error)
  }
})

const credentials = z.object({
  email: z.string().trim().email().max(200).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(100),
})

app.post('/api/auth/register', async (request, response, next) => {
  try {
    if (!database.pool) return response.status(503).json({ error: 'PostgreSQL is required for account registration' })
    const input = credentials.parse(request.body)
    const passwordHash = await bcrypt.hash(input.password, 12)
    const result = await database.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, plan`,
      [input.email, passwordHash],
    )
    const user = result.rows[0]
    response.status(201).json({ token: createToken(user), user })
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'An account with this email already exists' })
    next(error)
  }
})

app.post('/api/auth/login', async (request, response, next) => {
  try {
    if (!database.pool) return response.status(503).json({ error: 'PostgreSQL is required for login' })
    const input = credentials.parse(request.body)
    const result = await database.query('SELECT id, email, plan, password_hash FROM users WHERE email = $1', [input.email])
    const user = result.rows[0]
    if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
      return response.status(401).json({ error: 'Invalid email or password' })
    }
    const safeUser = { id: user.id, email: user.email, plan: user.plan }
    response.json({ token: createToken(safeUser), user: safeUser })
  } catch (error) {
    next(error)
  }
})

app.get('/api/reports/:analysisId', optionalAuth, async (request, response, next) => {
  try {
    if (!database.pool) return response.status(503).json({ error: 'PostgreSQL is required for reports' })
    const reportResult = await database.query(
      'SELECT full_result FROM analysis_runs WHERE id = $1',
      [request.params.analysisId],
    )
    if (!reportResult.rows[0]) return response.status(404).json({ error: 'Analysis not found' })
    response.json({ access: 'free-ad-supported', report: reportResult.rows[0].full_result })
  } catch (error) {
    next(error)
  }
})

app.use((error, _request, response, _next) => {
  if (error instanceof z.ZodError) {
    return response.status(400).json({ error: 'Invalid request', details: error.flatten() })
  }
  console.error(error)
  response.status(500).json({ error: error.message || 'Unexpected server error' })
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
