import pg from 'pg'

const { Pool } = pg
const connectionString = process.env.DATABASE_URL
const databaseSsl = /^(1|true|require)$/i.test(process.env.DATABASE_SSL || '')

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: databaseSsl ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' } : false,
      max: Math.max(2, Number(process.env.DATABASE_POOL_MAX || 5)),
      idleTimeoutMillis: Math.max(5_000, Number(process.env.DATABASE_IDLE_TIMEOUT_MS || 30_000)),
      connectionTimeoutMillis: Math.max(1_000, Number(process.env.DATABASE_CONNECT_TIMEOUT_MS || 5_000)),
      statement_timeout: Math.max(2_000, Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS || 15_000)),
      application_name: 'launchbase-search',
    })
  : null

export async function query(text, params = []) {
  if (!pool) throw new Error('DATABASE_URL is not configured')
  return pool.query(text, params)
}

export async function tryQuery(text, params = []) {
  if (!pool) return null
  try {
    return await pool.query(text, params)
  } catch (error) {
    console.warn(`Database operation skipped: ${error.message}`)
    return null
  }
}
