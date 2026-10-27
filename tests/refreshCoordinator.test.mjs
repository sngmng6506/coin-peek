import assert from 'node:assert/strict'
import test from 'node:test'
import { createRefreshCoordinator } from '../src/main/refreshCoordinator.js'

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('a list change discards an older response and publishes the new list', async () => {
  let items = [{ market: 'US', symbol: 'AAPL' }]
  const pending = deferred()
  const published = []
  const refresh = createRefreshCoordinator({
    getItems: () => items,
    fetchItem: (item) => (item.symbol === 'AAPL' ? pending.promise : Promise.resolve(item)),
    publish: (result) => published.push(result)
  })

  const first = refresh()
  items = [{ market: 'JP', symbol: '7203' }]
  const second = refresh()
  pending.resolve({ market: 'US', symbol: 'AAPL' })
  await Promise.all([first, second])

  assert.deepEqual(published, [[{ market: 'JP', symbol: '7203' }]])
})

test('a holding change during the request is reflected without a second explicit refresh', async () => {
  let items = [{ market: 'KR', symbol: '005930', quantity: 10 }]
  const pending = deferred()
  const published = []
  let fetchCount = 0
  const refresh = createRefreshCoordinator({
    getItems: () => items,
    fetchItem: (item) => {
      fetchCount += 1
      return fetchCount === 1 ? pending.promise : Promise.resolve({ ...item, price: 80000 })
    },
    publish: (result) => published.push(result)
  })

  const request = refresh()
  items = [{ market: 'KR', symbol: '005930', quantity: 20 }]
  pending.resolve({ market: 'KR', symbol: '005930', quantity: 10, price: 80000 })
  await request

  assert.equal(fetchCount, 2)
  assert.equal(published.length, 1)
  assert.equal(published[0][0].quantity, 20)
})

test('simultaneous refreshes run serially and publish only the newest result', async () => {
  const pending = deferred()
  const published = []
  let fetchCount = 0
  const refresh = createRefreshCoordinator({
    getItems: () => [{ market: 'US', symbol: 'NVDA' }],
    fetchItem: () => {
      fetchCount += 1
      return fetchCount === 1 ? pending.promise : Promise.resolve({ price: 2 })
    },
    publish: (result) => published.push(result)
  })

  const first = refresh()
  const second = refresh()
  assert.equal(fetchCount, 1)
  pending.resolve({ price: 1 })
  await Promise.all([first, second])

  assert.equal(fetchCount, 2)
  assert.deepEqual(published, [[{ price: 2 }]])
})

test('a manual refresh during an automatic request forces the next fetch', async () => {
  const pending = deferred()
  const forceFlags = []
  const refresh = createRefreshCoordinator({
    getItems: () => [{ market: 'SA', symbol: '2222' }],
    fetchItem: (_item, { force }) => {
      forceFlags.push(force)
      return forceFlags.length === 1 ? pending.promise : Promise.resolve({ price: 1 })
    },
    publish: () => {}
  })

  const automatic = refresh()
  const manual = refresh({ force: true })
  pending.resolve({ price: 0 })
  await Promise.all([automatic, manual])
  assert.deepEqual(forceFlags, [false, true])
})

test('fast quotes publish while a slow quote is pending, keeping previous prices', async () => {
  const pending = deferred()
  const items = [
    { market: 'US', symbol: 'AAPL' },
    { market: 'JP', symbol: '7203' }
  ]
  const published = []
  const refresh = createRefreshCoordinator({
    getItems: () => items,
    getCached: () => [{ ...items[1], price: 100 }],
    fetchItem: (item) =>
      item.market === 'US' ? Promise.resolve({ ...item, price: 200 }) : pending.promise,
    publish: (data) => published.push(data)
  })
  const done = refresh()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(published[0][0].price, 200)
  assert.equal(published[0][1].price, 100)
  pending.resolve({ ...items[1], price: 101 })
  await done
  assert.equal(published.at(-1)[1].price, 101)
})
