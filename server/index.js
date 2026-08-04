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
import { isContactEmailConfigured, sendContactEmail } from './services/contactEmail.js'

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
const contactLimiter = rateLimit({
  windowMs: Math.max(60_000, Number(process.env.CONTACT_RATE_WINDOW_MS || 900_000)),
  limit: Math.max(1, Number(process.env.CONTACT_RATE_LIMIT || 5)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contact messages from this connection. Please try again later.' },
})

app.get('/api/health', async (_request, response) => {
  const databaseResult = await database.tryQuery('SELECT NOW() AS now')
  response.json({
    status: 'ok',
    database: databaseResult ? 'connected' : 'not-configured',
    malaysiaOpenData: 'configured',
    googleMaps: process.env.VITE_GOOGLE_MAPS_EMBED_API_KEY ? 'embed-configured' : 'embed-key-required',
    openMarketData: 'openstreetmap-with-postgres-cache',
    outcomeCalibration: process.env.OUTCOME_INGEST_TOKEN ? 'private-ingest-configured' : 'not-configured',
    contactEmail: isContactEmailConfigured() ? 'smtp-configured' : 'not-configured',
  })
})

const contactInput = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(2000),
  website: z.string().max(200).optional().default(''),
})

app.post('/api/contact', contactLimiter, async (request, response, next) => {
  try {
    const input = contactInput.parse(request.body)
    // Bots commonly fill fields hidden from people. Return the same response so
    // the field cannot be used to probe the spam protection.
    if (input.website) return response.status(202).json({ status: 'sent' })
    await sendContactEmail(input)
    response.set('Cache-Control', 'no-store')
    return response.status(202).json({ status: 'sent' })
  } catch (error) {
    return next(error)
  }
})

const businessOutcomeInput = z.object({
  externalStoreId: z.string().trim().min(3).max(200),
  categorySlug: z.string().trim().regex(/^[a-z0-9_]{2,80}$/),
  state: z.string().trim().max(100).optional(),
  district: z.string().trim().max(120).optional(),
  lat: z.coerce.number().min(0.8).max(7.6),
  lng: z.coerce.number().min(99.5).max(119.5),
  openedOn: z.string().date().optional(),
  closedOn: z.string().date().optional(),
  observationMonth: z.string().regex(/^\d{4}-\d{2}-01$/),
  monthlySalesRm: z.coerce.number().min(0).max(1_000_000_000).optional(),
  monthlyTransactions: z.coerce.number().int().min(0).max(100_000_000).optional(),
  averageTicketRm: z.coerce.number().min(0).max(1_000_000).optional(),
  grossMargin: z.coerce.number().gt(0).max(1).optional(),
  monthlyRentRm: z.coerce.number().min(0).max(10_000_000).optional(),
  monthlyPayrollRm: z.coerce.number().min(0).max(100_000_000).optional(),
  otherMonthlyFixedCostsRm: z.coerce.number().min(0).max(100_000_000).optional(),
  floorAreaSqm: z.coerce.number().gt(0).max(1_000_000).optional(),
  weeklyOpenHours: z.coerce.number().min(0).max(168).optional(),
  chainStore: z.boolean().optional(),
  sourceType: z.enum(['opt-in-pos', 'accounting-partner', 'owner-submission', 'licensed-register']),
  consentBasis: z.string().trim().min(3).max(300),
  metadata: z.record(z.unknown()).optional().default({}),
}).refine(
  (value) => value.monthlySalesRm !== undefined || value.monthlyTransactions !== undefined || value.closedOn,
  { message: 'Provide sales, transactions, or a closure outcome' },
)

function validBearerToken(request, expectedToken) {
  const supplied = request.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const suppliedBytes = Buffer.from(supplied)
  const expectedBytes = Buffer.from(expectedToken || '')
  return suppliedBytes.length > 0
    && suppliedBytes.length === expectedBytes.length
    && crypto.timingSafeEqual(suppliedBytes, expectedBytes)
}

app.post('/api/model/outcomes', async (request, response, next) => {
  try {
    const ingestToken = process.env.OUTCOME_INGEST_TOKEN
    if (!ingestToken) return response.status(503).json({ error: 'Private outcome ingestion is not configured' })
    if (!validBearerToken(request, ingestToken)) return response.status(401).json({ error: 'Unauthorized' })
    if (!database.pool) return response.status(503).json({ error: 'Database is not configured' })

    const input = businessOutcomeInput.parse(request.body)
    const category = await database.query(
      'SELECT slug FROM business_benchmarks WHERE slug = $1',
      [input.categorySlug],
    )
    if (!category.rows.length) return response.status(400).json({ error: 'Unknown benchmark category' })
    const externalRefHash = crypto
      .createHmac('sha256', ingestToken)
      .update(input.externalStoreId)
      .digest('hex')
    await database.query(`
      INSERT INTO business_outcomes (
        external_ref_hash, category_slug, state, district, latitude, longitude,
        opened_on, closed_on, observation_month, monthly_sales_rm,
        monthly_transactions, average_ticket_rm, gross_margin, monthly_rent_rm,
        monthly_payroll_rm, other_monthly_fixed_costs_rm, floor_area_sqm,
        weekly_open_hours, chain_store, source_type, consent_basis, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      )
      ON CONFLICT (external_ref_hash, category_slug, observation_month)
      DO UPDATE SET
        state = EXCLUDED.state,
        district = EXCLUDED.district,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        opened_on = EXCLUDED.opened_on,
        closed_on = EXCLUDED.closed_on,
        monthly_sales_rm = EXCLUDED.monthly_sales_rm,
        monthly_transactions = EXCLUDED.monthly_transactions,
        average_ticket_rm = EXCLUDED.average_ticket_rm,
        gross_margin = EXCLUDED.gross_margin,
        monthly_rent_rm = EXCLUDED.monthly_rent_rm,
        monthly_payroll_rm = EXCLUDED.monthly_payroll_rm,
        other_monthly_fixed_costs_rm = EXCLUDED.other_monthly_fixed_costs_rm,
        floor_area_sqm = EXCLUDED.floor_area_sqm,
        weekly_open_hours = EXCLUDED.weekly_open_hours,
        chain_store = EXCLUDED.chain_store,
        source_type = EXCLUDED.source_type,
        consent_basis = EXCLUDED.consent_basis,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `, [
      externalRefHash,
      input.categorySlug,
      input.state || null,
      input.district || null,
      input.lat,
      input.lng,
      input.openedOn || null,
      input.closedOn || null,
      input.observationMonth,
      input.monthlySalesRm ?? null,
      input.monthlyTransactions ?? null,
      input.averageTicketRm ?? null,
      input.grossMargin ?? null,
      input.monthlyRentRm ?? null,
      input.monthlyPayrollRm ?? null,
      input.otherMonthlyFixedCostsRm ?? null,
      input.floorAreaSqm ?? null,
      input.weeklyOpenHours ?? null,
      input.chainStore ?? null,
      input.sourceType,
      input.consentBasis,
      input.metadata,
    ])
    response.status(201).json({ status: 'accepted', persisted: 'consented-outcome-only' })
  } catch (error) {
    next(error)
  }
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
