import { finiteNumber, positivePrice } from './numbers.js'
import { createBatcher } from './batch.js'
import { rankMatches } from './search.js'
import { notListed } from './errors.js'

// 바이낸스 USDT 마켓. 키 없는 공개 시세 API.
// data-api.binance.vision은 시세 전용 공식 도메인 (api.binance.com이 막힌 지역에서도 열림) → 실패하면 api.binance.com.
// 등락률은 24시간 롤링 기준.
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com']
const QUOTE = 'USDT'
const LIST_TTL = 6 * 60 * 60 * 1000
const CHART_TTL = 600_000

const toPair = (symbol) => `${symbol}${QUOTE}`
const fromPair = (pair) => String(pair || '').slice(0, -QUOTE.length)

export function createBinanceProvider({ fetchJson, now = () => Date.now() }) {
  const headers = { Accept: 'application/json' }

  // 첫 호스트가 네트워크 오류·5xx면 다음 호스트. 4xx(없는 심볼 등)는 그대로 반환
  async function get(path) {
    let last
    for (const host of HOSTS) {
      try {
        const res = await fetchJson(`${host}${path}`, { headers })
        const regionBlocked = res.status === 403 || res.status === 451
        if (res.ok || (res.status >= 400 && res.status < 500 && !regionBlocked)) return res
        last = res
      } catch (e) {
        last = e
      }
    }
    if (last instanceof Error) throw last
    return last
  }

  // 검색용 USDT 페어 목록 + 24시간 거래대금(검색 순위)
  let list = null
  let listAt = 0
  let listRequest = null
  function loadList() {
    if (list && now() - listAt < LIST_TTL) return Promise.resolve(list)
    if (!listRequest) {
      listRequest = get('/api/v3/ticker/24hr?type=MINI')
        .then((res) => {
          if (!res.ok) throw new Error(`Binance list: ${res.status}`)
          list = (Array.isArray(res.data) ? res.data : [])
            .filter((t) => t.symbol?.endsWith(QUOTE) && t.symbol.length > QUOTE.length)
            .map((t) => ({ symbol: fromPair(t.symbol), volume: finiteNumber(t.quoteVolume) }))
            // 상장폐지·거래 중단 페어는 거래대금 0
            .filter((c) => c.volume > 0)
          listAt = now()
          return list
        })
        .finally(() => {
          listRequest = null
        })
    }
    return listRequest
  }

  const charts = new Map()
  const chartRequests = new Set()
  const chartRetryAt = new Map()
  function refreshChart(symbol) {
    if (chartRequests.has(symbol) || now() < (chartRetryAt.get(symbol) || 0)) return
    chartRequests.add(symbol)
    get(`/api/v3/klines?symbol=${toPair(symbol)}&interval=1d&limit=90`)
      .then((res) => {
        if (!res.ok || !Array.isArray(res.data)) throw new Error('chart unavailable')
        // [openTime, open, high, low, close, ...] 과거 → 최신
        const prices = res.data.map((k) => positivePrice(k?.[4])).filter(Number.isFinite)
        if (!prices.length) throw new Error('empty chart')
        charts.set(symbol, prices)
        chartRetryAt.set(symbol, now() + CHART_TTL)
      })
      .catch(() => chartRetryAt.set(symbol, now() + 60_000))
      .finally(() => chartRequests.delete(symbol))
  }

  const loadTicker = createBatcher(async (symbols) => {
    const pairs = encodeURIComponent(JSON.stringify(symbols.map(toPair)))
    const res = await get(`/api/v3/ticker/24hr?symbols=${pairs}`)
    // 없는 심볼이 섞이면 400 → batcher가 하나씩 다시 조회
    if (res.status === 400) throw notListed('Binance ticker')
    if (!res.ok) throw new Error(`Binance ticker: ${res.status}`)
    const out = new Map()
    for (const t of Array.isArray(res.data) ? res.data : []) out.set(fromPair(t.symbol), t)
    return out
  })

  async function fetchQuote(symbol) {
    refreshChart(symbol)
    const t = await loadTicker(symbol)
    const price = positivePrice(t.lastPrice)
    const change = finiteNumber(t.priceChange)
    const ratio = finiteNumber(t.priceChangePercent)
    return {
      market: 'BINANCE',
      symbol,
      currency: QUOTE,
      name: symbol,
      price,
      change: Number.isFinite(change) ? change : 0,
      changeRatio: Number.isFinite(ratio) ? ratio : 0,
      isUp: !(change < 0),
      prices: charts.get(symbol) || []
    }
  }

  async function search(keyword) {
    const coins = await loadList()
    return rankMatches(coins, keyword, (c) => [c.symbol], { weight: (c) => c.volume }).map((c) => ({
      market: 'BINANCE',
      symbol: c.symbol,
      name: c.symbol,
      type: QUOTE
    }))
  }

  return { search, fetch: fetchQuote }
}
