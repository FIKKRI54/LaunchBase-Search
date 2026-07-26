import * as database from '../db.js'
import { TtlLruCache } from './runtimeCache.js'

const memoryCache = new TtlLruCache(process.env.MEMORY_CACHE_MAX_ENTRIES || 64)

export async function readExternalCache(cacheKey, { allowExpired = false } = {}) {
  const memory = memoryCache.get(cacheKey, { allowExpired })
  if (memory) {
    return {
      payload: memory.payload,
      fresh: memory.expiresAt > Date.now(),
      source: memory.source,
      expiresAt: memory.expiresAt,
    }
  }

  const result = await database.tryQuery(
    `SELECT payload, source, expires_at, expires_at > NOW() AS is_fresh
     FROM api_cache
     WHERE cache_key = $1
       AND ($2::boolean OR expires_at > NOW())
     LIMIT 1`,
    [cacheKey, allowExpired],
  )
  const row = result?.rows?.[0]
  if (!row) return null

  const entry = {
    payload: row.payload,
    source: row.source,
    fresh: row.is_fresh,
    expiresAt: new Date(row.expires_at).getTime(),
  }
  memoryCache.set(cacheKey, entry)
  return entry
}

export async function writeExternalCache(cacheKey, payload, source, ttlSeconds) {
  const expiresAt = Date.now() + ttlSeconds * 1000
  memoryCache.set(cacheKey, { payload, source, fresh: true, expiresAt })
  await database.tryQuery(
    `INSERT INTO api_cache (cache_key, payload, source, expires_at, updated_at)
     VALUES ($1, $2, $3, NOW() + make_interval(secs => $4::double precision), NOW())
     ON CONFLICT (cache_key)
     DO UPDATE SET
       payload = EXCLUDED.payload,
       source = EXCLUDED.source,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`,
    [cacheKey, payload, source, ttlSeconds],
  )
}

export function clearExternalMemoryCacheForTests() {
  memoryCache.clear()
}
