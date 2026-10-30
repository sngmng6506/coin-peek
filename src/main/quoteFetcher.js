import { isNotListed } from './markets/errors.js'

const CHART_TTL = 600_000 // 차트는 일봉(90일)이라 10분 캐시로 충분
const RETRY_BASE = 3_000
const RETRY_MAX = 60_000

// 보유 정보는 마지막 정상 시세에 저장하지 않고 매번 현재 목록에서 가져온다 ({...시세, ...보유} 순서).
function withCurrentHolding(quote, item) {
  return {
    ...quote,
    ...(item.quantity != null ? { quantity: item.quantity } : {}),
    ...(item.avgPrice != null ? { avgPrice: item.avgPrice } : {})
  }
}

// 코인 하나의 시세 조회. Electron 없이 테스트하도록 provider 조회와 시계를 주입받는다.
// - 실패하면 마지막 정상 시세(lastGood)를 stale로 돌려준다. 한 번도 성공 못 했을 때만 오류 코드.
// - 실패한 코인은 점점 늘어나는 간격(최대 1분)으로만 다시 조회한다. force는 이 간격을 무시.
export function createQuoteFetcher({ getProvider, now = () => Date.now() }) {
  const lastGood = new Map() // key: "BINANCE-BTC" → 성공 결과
  const failures = new Map() // key → { count, retryAt, errorCode, error }
  const chartCache = new Map() // key → { prices, ts }

  function fallback(key, item, failure) {
    const prev = lastGood.get(key)
    return prev
      ? { ...withCurrentHolding(prev, item), stale: true }
      : { ...item, errorCode: failure.errorCode, error: failure.error }
  }

  return async function fetchQuote(item, { force = false } = {}) {
    const key = `${item.market}-${item.symbol}`
    const retry = failures.get(key)
    if (!force && retry && now() < retry.retryAt) return fallback(key, item, retry)

    const provider = getProvider(item.market)
    if (!provider) return { ...item, errorCode: 'ERR_UNKNOWN_MARKET', error: 'unknown market' }

    try {
      const cached = chartCache.get(key)
      const useCachedChart = Boolean(cached && now() - cached.ts < CHART_TTL)
      const quote = await provider.fetch(item.symbol, { skipChart: useCachedChart })
      if (!Number.isFinite(quote.price) || quote.price <= 0) throw new Error('invalid price')
      if (quote.prices?.length) chartCache.set(key, { prices: quote.prices, ts: now() })
      else if (cached) quote.prices = cached.prices
      lastGood.set(key, quote)
      failures.delete(key)
      return withCurrentHolding(quote, item)
    } catch (e) {
      const count = (retry?.count || 0) + 1
      const failure = {
        count,
        retryAt: now() + Math.min(RETRY_MAX, RETRY_BASE * 2 ** Math.min(count, 5)),
        errorCode: isNotListed(e) ? 'ERR_NOT_LISTED' : 'ERR_FETCH',
        error: e?.message || String(e)
      }
      failures.set(key, failure)
      return fallback(key, item, failure)
    }
  }
}
