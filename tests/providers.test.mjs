import assert from 'node:assert/strict'
import test from 'node:test'
import { createUpbitProvider } from '../src/main/markets/upbit.js'
import { createBinanceProvider } from '../src/main/markets/binance.js'
import { createBitbankProvider } from '../src/main/markets/bitbank.js'
import { createBatcher } from '../src/main/markets/batch.js'
import { rankMatches } from '../src/main/markets/search.js'
import { getMarket, isMarketOpen } from '../src/shared/markets.js'

const ok = (data) => Promise.resolve({ ok: true, status: 200, data })
const fail = (status) => Promise.resolve({ ok: false, status })
const tick = () => new Promise((r) => setTimeout(r, 0))

test('symbols normalize to the bare coin ticker', () => {
  assert.equal(getMarket('UPBIT').normalizeSymbol('KRW-BTC'), 'BTC')
  assert.equal(getMarket('UPBIT').normalizeSymbol(' eth '), 'ETH')
  assert.equal(getMarket('UPBIT').normalizeSymbol('USDT'), 'USDT')
  assert.equal(getMarket('BINANCE').normalizeSymbol('solusdt'), 'SOL')
  assert.equal(getMarket('BINANCE').normalizeSymbol('1000SATS'), '1000SATS')
  assert.equal(getMarket('BITBANK').normalizeSymbol('btc_jpy'), 'BTC')
  assert.equal(getMarket('BITBANK').normalizeSymbol('xrp'), 'XRP')
  assert.ok(isMarketOpen('UPBIT', new Date('2026-10-25T03:00:00Z'))) // 일요일도 장중
})

test('batcher coalesces same-tick requests and isolates a bad symbol', async () => {
  const calls = []
  const load = createBatcher(async (symbols) => {
    calls.push(symbols)
    if (symbols.includes('BAD')) throw new Error('404')
    return new Map(symbols.map((s) => [s, { s }]))
  })
  const [a, b, c] = await Promise.allSettled([load('BTC'), load('ETH'), load('BAD')])
  assert.deepEqual(calls[0], ['BTC', 'ETH', 'BAD'])
  assert.equal(a.value.s, 'BTC')
  assert.equal(b.value.s, 'ETH')
  assert.equal(c.status, 'rejected')
})

test('search ranks exact, then prefix, then contains; weight breaks ties', () => {
  const items = [
    { s: 'BTCST', w: 1 },
    { s: 'WBTC', w: 100 },
    { s: 'BTC', w: 0 },
    { s: 'BTCDOM', w: 50 }
  ]
  const out = rankMatches(items, 'btc', (i) => [i.s], { weight: (i) => i.w }).map((i) => i.s)
  assert.deepEqual(out, ['BTC', 'BTCDOM', 'BTCST', 'WBTC'])
})

test('Upbit: batched ticker, Korean name, rate as percent, chart oldest first', async () => {
  const urls = []
  const fetchJson = (url) => {
    urls.push(url)
    if (url.includes('/ticker?'))
      return ok([
        {
          market: 'KRW-BTC',
          trade_price: 150000000,
          signed_change_price: -1500000,
          signed_change_rate: -0.0099,
          change: 'FALL'
        },
        {
          market: 'KRW-SHIB',
          trade_price: 0.0201,
          signed_change_price: 0.0003,
          signed_change_rate: 0.015,
          change: 'RISE'
        }
      ])
    if (url.includes('/market/all'))
      return ok([
        { market: 'KRW-BTC', korean_name: '비트코인', english_name: 'Bitcoin' },
        { market: 'BTC-ETH', korean_name: '이더리움', english_name: 'Ethereum' }
      ])
    if (url.includes('/candles/days'))
      return ok([{ trade_price: 3 }, { trade_price: 2 }, { trade_price: 1 }])
    return fail(404)
  }
  const upbit = createUpbitProvider({ fetchJson })
  await upbit.search('비트') // 목록 미리 적재
  const [btc, shib] = await Promise.all([upbit.fetch('BTC'), upbit.fetch('SHIB')])
  assert.equal(urls.filter((u) => u.includes('/ticker?')).length, 1)
  assert.ok(urls.some((u) => u.endsWith('markets=KRW-BTC,KRW-SHIB')))
  assert.equal(btc.localName, '비트코인')
  assert.equal(btc.name, 'Bitcoin')
  assert.equal(btc.isUp, false)
  assert.ok(Math.abs(btc.changeRatio - -0.99) < 1e-9)
  assert.equal(shib.price, 0.0201)
  await tick()
  const again = await upbit.fetch('BTC')
  assert.deepEqual(again.prices, [1, 2, 3])
})

test('Upbit search only returns KRW markets', async () => {
  const upbit = createUpbitProvider({
    fetchJson: () =>
      ok([
        { market: 'KRW-ETH', korean_name: '이더리움', english_name: 'Ethereum' },
        { market: 'BTC-ETH', korean_name: '이더리움', english_name: 'Ethereum' },
        { market: 'KRW-ETC', korean_name: '이더리움클래식', english_name: 'Ethereum Classic' }
      ])
  })
  const out = await upbit.search('이더리움')
  assert.deepEqual(
    out.map((r) => r.symbol),
    ['ETH', 'ETC']
  )
})

test('Binance: falls back to api.binance.com, unknown symbol is "not found"', async () => {
  const urls = []
  const fetchJson = (url) => {
    urls.push(url)
    if (url.startsWith('https://data-api.binance.vision')) return Promise.reject(new Error('net'))
    if (url.includes('ticker/24hr?symbols=')) {
      const pairs = JSON.parse(decodeURIComponent(url.split('symbols=')[1]))
      if (pairs.includes('NOPEUSDT')) return fail(400)
      return ok(
        pairs.map((p) => ({
          symbol: p,
          lastPrice: '100.5',
          priceChange: '-1.5',
          priceChangePercent: '-1.47'
        }))
      )
    }
    if (url.includes('/klines'))
      return ok([
        [0, '1', '1', '1', '1'],
        [0, '2', '2', '2', '2']
      ])
    return fail(404)
  }
  const binance = createBinanceProvider({ fetchJson })
  const [sol, nope] = await Promise.allSettled([binance.fetch('SOL'), binance.fetch('NOPE')])
  assert.equal(sol.value.price, 100.5)
  assert.equal(sol.value.changeRatio, -1.47)
  assert.equal(sol.value.isUp, false)
  assert.match(nope.reason.message, /not found/)
  assert.ok(urls.some((u) => u.startsWith('https://api.binance.com')))
})

test('Binance search keeps active USDT pairs ranked by volume', async () => {
  const binance = createBinanceProvider({
    fetchJson: () =>
      ok([
        { symbol: 'BTCUSDT', quoteVolume: '9000' },
        { symbol: 'BTCDOMUSDT', quoteVolume: '10' },
        { symbol: 'BTCFDUSD', quoteVolume: '99999' },
        { symbol: 'BTCSTUSDT', quoteVolume: '0' },
        { symbol: 'WBTCUSDT', quoteVolume: '500' }
      ])
  })
  const out = await binance.search('btc')
  assert.deepEqual(
    out.map((r) => r.symbol),
    ['BTC', 'BTCDOM', 'WBTC']
  )
})

test('Upbit: unknown market (400 or 404) becomes "not found" without breaking the batch', async () => {
  for (const status of [400, 404]) {
    const upbit = createUpbitProvider({
      fetchJson: (url) => {
        if (url.includes('NOPE')) return fail(status)
        if (url.includes('/ticker?'))
          return ok([{ market: 'KRW-BTC', trade_price: 1, signed_change_rate: 0, change: 'EVEN' }])
        return fail(404)
      }
    })
    const [btc, nope] = await Promise.allSettled([upbit.fetch('BTC'), upbit.fetch('NOPE')])
    assert.equal(btc.value.price, 1)
    assert.match(nope.reason.message, /not found/)
  }
})

test('bitbank: one /tickers_jpy call for many coins, change vs 24h open, Japanese name', async () => {
  const urls = []
  const rows = [
    { pair: 'btc_jpy', last: '12000000', open: '11880000', vol: '100' },
    { pair: 'xrp_jpy', last: '0.0123', open: '0.0125', vol: '1000000' },
    { pair: 'bcc_jpy', last: '60000', open: '60000', vol: '5' }
  ]
  const fetchJson = (url) => {
    urls.push(url)
    if (url.endsWith('/tickers_jpy')) return ok({ success: 1, data: rows })
    if (url.includes('/candlestick/1day/'))
      return ok({
        success: 1,
        data: {
          candlestick: [
            {
              ohlcv: [
                ['1', '1', '1', '10', '1', 0],
                ['1', '1', '1', '11', '1', 0]
              ]
            }
          ]
        }
      })
    return fail(404)
  }
  const bitbank = createBitbankProvider({ fetchJson, now: () => Date.UTC(2026, 9, 27) })
  const [btc, xrp, bch, nope] = await Promise.allSettled(
    ['BTC', 'XRP', 'BCC', 'NOPE'].map((s) => bitbank.fetch(s))
  )
  assert.equal(urls.filter((u) => u.endsWith('/tickers_jpy')).length, 1)
  assert.equal(btc.value.price, 12000000)
  assert.ok(Math.abs(btc.value.changeRatio - (120000 / 11880000) * 100) < 1e-9)
  assert.equal(btc.value.isUp, true)
  assert.equal(btc.value.localName, 'ビットコイン')
  assert.equal(xrp.value.isUp, false)
  assert.equal(bch.value.name, 'Bitcoin Cash')
  assert.match(nope.reason.message, /not found/)
  // 올해 캔들이 90개 미만이면 작년 것도 가져와 이어 붙임
  await tick()
  assert.ok(urls.some((u) => u.endsWith('/btc_jpy/candlestick/1day/2026')))
  assert.ok(urls.some((u) => u.endsWith('/btc_jpy/candlestick/1day/2025')))
  const again = await bitbank.fetch('BTC')
  assert.deepEqual(again.prices, [10, 11, 10, 11])
})

test('bitbank search ranks by yen volume and matches Japanese names', async () => {
  const bitbank = createBitbankProvider({
    fetchJson: () =>
      ok({
        success: 1,
        data: [
          { pair: 'eth_jpy', last: '500000', vol: '10' },
          { pair: 'etc_jpy', last: '3000', vol: '10' },
          { pair: 'btc_jpy', last: '12000000', vol: '0' }
        ]
      })
  })
  assert.deepEqual(
    (await bitbank.search('et')).map((r) => r.symbol),
    ['ETH', 'ETC']
  )
  assert.deepEqual(
    (await bitbank.search('イーサ')).map((r) => r.symbol),
    ['ETH']
  )
})
