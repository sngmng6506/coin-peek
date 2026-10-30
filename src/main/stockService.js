import { getProvider } from './markets/index.js'
import { isNotListed } from './markets/errors.js'
import { getItems } from './watchlist.js'
import { createRefreshCoordinator } from './refreshCoordinator.js'

const REFRESH_INTERVAL = 3_000 // 코인은 24시간 거래라 항상 같은 간격
const JITTER = 250 // ms, 다중 사용자 호출 분산용
const CHART_TTL = 600_000 // 차트는 일봉(90일)이라 10분 캐시로 충분

let polling = false
let timer = null
let cache = []
const listeners = new Set()

// 일봉 prices 캐시. key: "UPBIT-BTC", value: { prices, ts }
const chartCache = new Map()

// --- Fetch logic --------------------------------------------------

// 마지막으로 성공한 시세. key: "BINANCE-BTC", value: 성공 결과 객체
const lastGood = new Map()
const failures = new Map() // key → { count, retryAt }

function withCurrentHolding(quote, item) {
  // 마지막 정상 시세에는 가격 정보만 저장하고 보유 정보는 매번 현재 목록에서 가져온다.
  return {
    ...quote,
    ...(item.quantity != null ? { quantity: item.quantity } : {}),
    ...(item.avgPrice != null ? { avgPrice: item.avgPrice } : {})
  }
}

function notify(results) {
  for (const fn of listeners) {
    try {
      fn(results)
    } catch (e) {
      console.error('stockService listener error:', e)
    }
  }
}

async function fetchOne(item, { force = false } = {}) {
  const key = `${item.market}-${item.symbol}`
  const retry = failures.get(key)
  if (!force && retry && Date.now() < retry.retryAt) {
    const prev = lastGood.get(key)
    return prev
      ? { ...withCurrentHolding(prev, item), stale: true }
      : { ...item, errorCode: retry.errorCode, error: retry.error }
  }

  try {
    const provider = getProvider(item.market)
    if (!provider) return { ...item, errorCode: 'ERR_UNKNOWN_MARKET', error: 'unknown market' }
    const cached = chartCache.get(key)
    const useCachedChart = cached && Date.now() - cached.ts < CHART_TTL
    const result = await provider.fetch(item.symbol, { skipChart: useCachedChart })
    if (!Number.isFinite(result.price) || result.price <= 0) throw new Error('invalid price')
    if (result.prices?.length) {
      chartCache.set(key, { prices: result.prices, ts: Date.now() })
    } else if (cached) {
      result.prices = cached.prices
    }
    // 성공 → 마지막 정상값으로 저장.
    const quote = result
    lastGood.set(key, quote)
    failures.delete(key)
    return withCurrentHolding(quote, item)
  } catch (e) {
    const message = e.message || String(e)
    const errorCode = isNotListed(e) ? 'ERR_NOT_LISTED' : 'ERR_FETCH'
    const count = (failures.get(key)?.count || 0) + 1
    failures.set(key, {
      count,
      retryAt: Date.now() + Math.min(60_000, 3_000 * 2 ** Math.min(count, 5)),
      errorCode,
      error: message
    })
    // 네트워크 끊김 등 실패 → 마지막 정상 가격을 유지하고 stale 플래그만 표시.
    const prev = lastGood.get(key)
    if (prev) {
      return { ...withCurrentHolding(prev, item), stale: true }
    }
    // 한 번도 성공 못 한 경우에만 에러 표시. 코드는 화면에서 번역 (error.<CODE>)
    return {
      ...item,
      error: message,
      errorCode
    }
  }
}

export const refreshAll = createRefreshCoordinator({
  getItems,
  getCached: () => cache,
  fetchItem: fetchOne,
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
    .catch((e) => console.error('stockService refresh error:', e))
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
