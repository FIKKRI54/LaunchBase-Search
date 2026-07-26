const inFlight = new Map()

export function singleFlight(key, task) {
  const existing = inFlight.get(key)
  if (existing) return existing

  const request = Promise.resolve()
    .then(task)
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key)
    })
  inFlight.set(key, request)
  return request
}

export function runInBackground(key, task) {
  singleFlight(key, task).catch((error) => {
    console.warn(`Background refresh skipped: ${error.message}`)
  })
}

export class TtlLruCache {
  constructor(maxEntries = 64) {
    this.maxEntries = Math.max(1, Number(maxEntries) || 64)
    this.entries = new Map()
  }

  get(key, { allowExpired = false } = {}) {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (!allowExpired && entry.expiresAt <= Date.now()) return null
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry
  }

  set(key, value) {
    this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value)
    }
  }

  clear() {
    this.entries.clear()
  }

  get size() {
    return this.entries.size
  }
}

export function clearRuntimeFlightsForTests() {
  inFlight.clear()
}
