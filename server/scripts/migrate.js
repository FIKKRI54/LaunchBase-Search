import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { pool } from '../db.js'

if (!pool) {
  console.error('DATABASE_URL is not configured. Copy .env.example to .env first.')
  process.exit(1)
}

try {
  const schema = await readFile(new URL('../../db/schema.sql', import.meta.url), 'utf8')
  const seed = await readFile(new URL('../../db/seed.sql', import.meta.url), 'utf8')
  await pool.query(schema)
  await pool.query(seed)
  console.log('PostgreSQL schema and starter benchmarks are ready.')
} finally {
  await pool.end()
}
