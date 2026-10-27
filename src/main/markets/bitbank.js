import { finiteNumber, positivePrice } from './numbers.js'
import { createBatcher } from './batch.js'
import { rankMatches } from './search.js'

// bitbank 엔화(JPY) 마켓. 키 없는 공개 시세 API (https://github.com/bitbankinc/bitbank-api-docs).
// /tickers_jpy 한 번에 모든 엔화 페어가 오므로, 같은 갱신의 코인들은 요청 1번으로 처리.
// 등락률은 24시간 전 시가(open) 대비.
const BASE = 'https://public.bitbank.cc'
const TICKERS_URL = `${BASE}/tickers_jpy`
const CANDLES_URL = (pair, year) => `${BASE}/${pair}/candlestick/1day/${year}`

const LIST_TTL = 6 * 60 * 60 * 1000
const CHART_TTL = 600_000
const CHART_DAYS = 90

const toPair = (symbol) => `${symbol.toLowerCase()}_jpy`
const fromPair = (pair) =>
  String(pair || '')
    .replace(/_jpy$/i, '')
    .toUpperCase()

// 일본어 화면에 보일 이름. 목록에 없는 코인은 티커로 표시
const JA_NAMES = {
  BTC: 'ビットコイン',
  ETH: 'イーサリアム',
  XRP: 'エックスアールピー',
  LTC: 'ライトコイン',
  BCC: 'ビットコインキャッシュ',
  MONA: 'モナコイン',
  XLM: 'ステラルーメン',
  DOT: 'ポルカドット',
  DOGE: 'ドージコイン',
  ADA: 'カルダノ',
  SOL: 'ソラナ',
  AVAX: 'アバランチ',
  LINK: 'チェーンリンク'
}
// bitbank는 비트코인캐시를 BCC로 씀
const EN_NAMES = { BCC: 'Bitcoin Cash' }

export function createBitbankProvider({ fetchJson, now = () => Date.now() }) {
  const headers = { Accept: 'application/json' }

  async function getTickers() {
    const res = await fetchJson(TICKERS_URL, { headers })
    if (!res.ok || res.data?.success !== 1 || !Array.isArray(res.data.data)) {
      throw new Error(`bitbank tickers: ${res.status}`)
    }
    return res.data.data
  }

  // 같은 틱에 들어온 요청은 /tickers_jpy 한 번으로
  const loadTicker = createBatcher(async () => {
    const out = new Map()
    for (const t of await getTickers()) out.set(fromPair(t.pair), t)
    return out
  })

  // 검색용 목록 + 거래대금(엔) 순위
  let list = null
  let listAt = 0
  let listRequest = null
  function loadList() {
    if (list && now() - listAt < LIST_TTL) return Promise.resolve(list)
    if (!listRequest) {
      listRequest = getTickers()
        .then((rows) => {
          list = rows
            .map((t) => {
              const symbol = fromPair(t.pair)
              return {
                symbol,
                name: EN_NAMES[symbol] || symbol,
                localName: JA_NAMES[symbol] || '',
                volume: finiteNumber(t.vol) * finiteNumber(t.last)
              }
            })
            .filter((c) => c.symbol && c.volume > 0)
          listAt = now()
          return list
        })
        .finally(() => {
          listRequest = null
        })
    }
    return listRequest
  }

  // 일봉은 연 단위로만 오므로 올해 + (90일이 안 차면) 작년
  const charts = new Map()
  const chartRequests = new Set()
  const chartRetryAt = new Map()
  function closesOf(res) {
    const rows = res.ok && res.data?.success === 1 ? res.data.data?.candlestick?.[0]?.ohlcv : null
    if (!Array.isArray(rows)) throw new Error('chart unavailable')
    return rows.map((r) => positivePrice(r?.[3])).filter(Number.isFinite)
  }
  function refreshChart(symbol) {
    if (chartRequests.has(symbol) || now() < (chartRetryAt.get(symbol) || 0)) return
    chartRequests.add(symbol)
    const pair = toPair(symbol)
    const year = new Date(now()).getUTCFullYear()
    fetchJson(CANDLES_URL(pair, year), { headers })
      .then(async (res) => {
        let prices = closesOf(res)
        if (prices.length < CHART_DAYS) {
          const prev = await fetchJson(CANDLES_URL(pair, year - 1), { headers })
          try {
            prices = closesOf(prev).concat(prices)
          } catch {
            // 작년 데이터가 없는 신규 상장 코인은 올해 것만
          }
        }
        prices = prices.slice(-CHART_DAYS)
        if (!prices.length) throw new Error('empty chart')
        charts.set(symbol, prices)
        chartRetryAt.set(symbol, now() + CHART_TTL)
      })
      .catch(() => chartRetryAt.set(symbol, now() + 60_000))
      .finally(() => chartRequests.delete(symbol))
  }

  async function fetchQuote(symbol) {
    refreshChart(symbol)
    const t = await loadTicker(symbol)
    const price = positivePrice(t.last)
    const open = positivePrice(t.open)
    const change = Number.isFinite(open) ? price - open : 0
    return {
      market: 'BITBANK',
      symbol,
      currency: 'JPY',
      name: EN_NAMES[symbol] || symbol,
      localName: JA_NAMES[symbol] || '',
      localLang: 'ja',
      price,
      change,
      changeRatio: Number.isFinite(open) ? (change / open) * 100 : 0,
      isUp: change >= 0,
      prices: charts.get(symbol) || []
    }
  }

  async function search(keyword) {
    const coins = await loadList()
    return rankMatches(coins, keyword, (c) => [c.symbol, c.name, c.localName], {
      weight: (c) => c.volume
    }).map((c) => ({
      market: 'BITBANK',
      symbol: c.symbol,
      name: c.name,
      localName: c.localName,
      localLang: 'ja',
      type: 'JPY'
    }))
  }

  return { search, fetch: fetchQuote }
}
