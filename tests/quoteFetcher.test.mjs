import assert from 'node:assert/strict'
import test from 'node:test'
import { createQuoteFetcher } from '../src/main/quoteFetcher.js'
import { notListed } from '../src/main/markets/errors.js'

// provider.fetch 응답을 차례로 돌려주는 가짜 거래소
function setup(responses) {
  let clock = 0
  const calls = []
  const provider = {
    async fetch(symbol, options) {
      calls.push(options)
      const next = responses.shift()
      if (next instanceof Error) throw next
      return { market: 'UPBIT', symbol, ...next }
    }
  }
  const fetchQuote = createQuoteFetcher({
    getProvider: (market) => (market === 'UPBIT' ? provider : null),
    now: () => clock
  })
  return { fetchQuote, calls, advance: (ms) => (clock += ms) }
}

const BTC = { market: 'UPBIT', symbol: 'BTC' }

test('holding from the watchlist wins over quote values', async () => {
  const { fetchQuote } = setup([{ price: 100, quantity: 999 }])
  const out = await fetchQuote({ ...BTC, quantity: 2, avgPrice: 50 })
  assert.equal(out.price, 100)
  assert.equal(out.quantity, 2)
  assert.equal(out.avgPrice, 50)
})

test('a failure after success keeps the last price as stale with the current holding', async () => {
  const { fetchQuote, advance } = setup([{ price: 100 }, new Error('net'), new Error('net')])
  await fetchQuote({ ...BTC, quantity: 1 })
  const failed = await fetchQuote({ ...BTC, quantity: 3 })
  assert.equal(failed.price, 100)
  assert.equal(failed.stale, true)
  assert.equal(failed.quantity, 3)
  assert.equal(failed.errorCode, undefined)
  // 보유를 지운 뒤에도 예전 보유가 남지 않음
  advance(60_000)
  const cleared = await fetchQuote(BTC)
  assert.equal(cleared.stale, true)
  assert.equal(cleared.quantity, undefined)
})

test('without a previous price, the error code tells "not listed" from a fetch failure', async () => {
  const { fetchQuote } = setup([notListed('Upbit ticker'), new Error('Upbit ticker: 429')])
  assert.equal((await fetchQuote(BTC)).errorCode, 'ERR_NOT_LISTED')
  const eth = await fetchQuote({ market: 'UPBIT', symbol: 'ETH' })
  assert.equal(eth.errorCode, 'ERR_FETCH')
  assert.equal(eth.price, undefined)
})

test('an invalid price is a failure, not a quote', async () => {
  const { fetchQuote } = setup([{ price: 0 }])
  assert.equal((await fetchQuote(BTC)).errorCode, 'ERR_FETCH')
})

test('a failed coin waits before retrying unless the refresh is forced', async () => {
  const { fetchQuote, calls, advance } = setup([new Error('net'), { price: 1 }, { price: 2 }])
  await fetchQuote(BTC)
  assert.equal((await fetchQuote(BTC)).errorCode, 'ERR_FETCH') // 대기 중이라 요청 안 함
  assert.equal(calls.length, 1)
  assert.equal((await fetchQuote(BTC, { force: true })).price, 1)
  advance(1)
  assert.equal((await fetchQuote(BTC)).price, 2) // 성공하면 대기 해제
  assert.equal(calls.length, 3)
})

test('the chart is reused for 10 minutes', async () => {
  const { fetchQuote, calls, advance } = setup([
    { price: 1, prices: [1, 2] },
    { price: 2, prices: [] },
    { price: 3, prices: [] }
  ])
  await fetchQuote(BTC)
  const second = await fetchQuote(BTC)
  assert.equal(calls[1].skipChart, true)
  assert.deepEqual(second.prices, [1, 2])
  advance(600_000)
  await fetchQuote(BTC)
  assert.equal(calls[2].skipChart, false)
})

test('an unknown market is reported without calling a provider', async () => {
  const { fetchQuote, calls } = setup([])
  assert.equal(
    (await fetchQuote({ market: 'NOPE', symbol: 'BTC' })).errorCode,
    'ERR_UNKNOWN_MARKET'
  )
  assert.equal(calls.length, 0)
})
