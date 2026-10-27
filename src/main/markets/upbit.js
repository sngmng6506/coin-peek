import { finiteNumber, positivePrice } from './numbers.js'
import { createBatcher } from './batch.js'
import { rankMatches } from './search.js'

// 업비트 KRW 마켓. 키 없는 공개 시세 API (IP당 초당 10회 → 시세는 묶음 조회).
// 등락률은 업비트 기준 전일 종가(한국 시간 0시) 대비.
const BASE = 'https://api.upbit.com/v1'
const TICKER_URL = (markets) => `${BASE}/ticker?markets=${markets.join(',')}`
const CANDLES_URL = (market) => `${BASE}/candles/days?market=${market}&count=90`
const MARKETS_URL = `${BASE}/market/all`

const LIST_TTL = 6 * 60 * 60 * 1000
const CHART_TTL = 600_000

const toMarket = (symbol) => `KRW-${symbol}`
const fromMarket = (market) => String(market || '').replace(/^KRW-/, '')

export function createUpbitProvider({ fetchJson, now = () => Date.now() }) {
  const headers = { Accept: 'application/json' }

  // 코인 목록 (이름·검색용). 시세 조회를 막지 않도록 이름은 캐시된 값만 씀
  let list = null
  let listAt = 0
  let listRequest = null
  function loadList() {
    if (list && now() - listAt < LIST_TTL) return Promise.resolve(list)
    if (!listRequest) {
      listRequest = fetchJson(MARKETS_URL, { headers })
        .then((res) => {
          if (!res.ok) throw new Error(`Upbit markets: ${res.status}`)
          list = (Array.isArray(res.data) ? res.data : [])
            .filter((m) => /^KRW-/.test(m.market))
            .map((m) => ({
              symbol: fromMarket(m.market),
              name: m.english_name || fromMarket(m.market),
              localName: m.korean_name || ''
            }))
          listAt = now()
          return list
        })
        .finally(() => {
          listRequest = null
        })
    }
    return listRequest
  }
  const namesOf = (symbol) => list?.find((c) => c.symbol === symbol)

  const charts = new Map()
  const chartRequests = new Set()
  const chartRetryAt = new Map()
  function refreshChart(symbol) {
    if (chartRequests.has(symbol) || now() < (chartRetryAt.get(symbol) || 0)) return
    chartRequests.add(symbol)
    fetchJson(CANDLES_URL(toMarket(symbol)), { headers })
      .then((res) => {
        if (!res.ok || !Array.isArray(res.data)) throw new Error('chart unavailable')
        // 응답은 최신 → 과거. 스파크라인은 시간순으로
        const prices = res.data
          .map((c) => positivePrice(c.trade_price))
          .filter(Number.isFinite)
          .reverse()
        if (!prices.length) throw new Error('empty chart')
        charts.set(symbol, prices)
        chartRetryAt.set(symbol, now() + CHART_TTL)
      })
      .catch(() => chartRetryAt.set(symbol, now() + 60_000))
      .finally(() => chartRequests.delete(symbol))
  }

  const loadTicker = createBatcher(async (symbols) => {
    const res = await fetchJson(TICKER_URL(symbols.map(toMarket)), { headers })
    // 없는 마켓이 섞이면 400/404 → batcher가 하나씩 다시 조회. 단건 400/404 = 없는 코인
    if (res.status === 400 || res.status === 404) throw new Error('Upbit ticker: market not found')
    if (!res.ok) throw new Error(`Upbit ticker: ${res.status}`)
    const out = new Map()
    for (const t of Array.isArray(res.data) ? res.data : []) out.set(fromMarket(t.market), t)
    return out
  })

  async function fetchQuote(symbol) {
    refreshChart(symbol)
    if (!list) loadList().catch(() => {})
    const t = await loadTicker(symbol)
    const price = positivePrice(t.trade_price)
    const change = finiteNumber(t.signed_change_price)
    const rate = finiteNumber(t.signed_change_rate)
    const names = namesOf(symbol)
    return {
      market: 'UPBIT',
      symbol,
      currency: 'KRW',
      name: names?.name || symbol,
      localName: names?.localName || '',
      localLang: 'ko',
      price,
      change: Number.isFinite(change) ? change : 0,
      changeRatio: Number.isFinite(rate) ? rate * 100 : 0,
      isUp: t.change ? t.change !== 'FALL' : change >= 0,
      prices: charts.get(symbol) || []
    }
  }

  async function search(keyword) {
    const coins = await loadList()
    return rankMatches(coins, keyword, (c) => [c.symbol, c.name, c.localName]).map((c) => ({
      market: 'UPBIT',
      symbol: c.symbol,
      name: c.name,
      localName: c.localName,
      localLang: 'ko',
      type: 'KRW'
    }))
  }

  return { search, fetch: fetchQuote }
}
