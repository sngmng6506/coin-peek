import { getProvider } from './markets/index.js'
import { createQuoteFetcher } from './quoteFetcher.js'
import { getItems } from './watchlist.js'
import { createRefreshCoordinator } from './refreshCoordinator.js'

const REFRESH_INTERVAL = 3_000 // 코인은 24시간 거래라 항상 같은 간격
const JITTER = 250 // ms, 다중 사용자 호출 분산용

let polling = false
let timer = null
let cache = []
const listeners = new Set()

function notify(results) {
  for (const fn of listeners) {
    try {
      fn(results)
    } catch (e) {
      console.error('quoteService listener error:', e)
    }
  }
}

const fetchQuote = createQuoteFetcher({ getProvider })

export const refreshAll = createRefreshCoordinator({
  getItems,
  getCached: () => cache,
  fetchItem: fetchQuote,
  publish(results) {
    cache = results
    notify(results)
  }
})

// --- Scheduling -----------------------------------------

function scheduleNext() {
  if (!polling) return
  if (timer) clearTimeout(timer)
  const jitter = Math.floor(Math.random() * (JITTER * 2)) - JITTER
  timer = setTimeout(tick, REFRESH_INTERVAL + jitter)
}

function tick() {
  refreshAll()
    .catch((e) => console.error('quoteService refresh error:', e))
    .finally(scheduleNext)
}

export function startPolling() {
  if (polling) return
  polling = true
  tick() // 즉시 첫 fetch + 이후 자동 스케줄
}

export function stopPolling() {
  polling = false
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

export function getCache() {
  return cache
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function reorderCache(order) {
  const map = new Map(cache.map((c) => [`${c.market}-${c.symbol}`, c]))
  cache = order.map((o) => map.get(`${o.market}-${o.symbol}`)).filter(Boolean)
  notify(cache)
}
