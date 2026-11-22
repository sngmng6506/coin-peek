import assert from 'node:assert/strict'
import test from 'node:test'
import {
  currencySymbol,
  formatMoney,
  formatNumber,
  quoteContext
} from '../src/renderer/src/lib/format.js'

test('coin prices keep 4 significant digits, large prices keep market decimals', () => {
  assert.equal(formatMoney(150000000, 'UPBIT', 'ko'), '150,000,000원')
  assert.equal(formatMoney(0.0201, 'UPBIT', 'ko'), '0.0201원')
  assert.equal(formatMoney(67012.345, 'BINANCE', 'en'), '$67,012.35')
  assert.equal(formatMoney(0.00001234, 'BINANCE', 'en'), '$0.00001234')
  assert.equal(formatMoney(0.5, 'BINANCE', 'en'), '$0.50')
})

test('holding quantity shows up to 8 decimals; Binance input label is USDT', () => {
  assert.equal(formatNumber(0.00012345, 'en'), '0.00012345')
  assert.equal(currencySymbol('BINANCE', 'ko'), 'USDT')
  assert.equal(currencySymbol('UPBIT', 'ko'), '원')
})

test('quote metadata shows the actual market pair and change-rate basis', () => {
  assert.deepEqual(quoteContext({ market: 'UPBIT', symbol: 'BTC' }), {
    marketId: 'UPBIT',
    pair: 'BTC/KRW',
    changeBasis: 'prevCloseKST'
  })
  assert.deepEqual(quoteContext({ market: 'BINANCE', symbol: 'BTC' }), {
    marketId: 'BINANCE',
    pair: 'BTC/USDT',
    changeBasis: 'rolling24h'
  })
  assert.deepEqual(quoteContext({ market: 'BITBANK', symbol: 'BTC' }), {
    marketId: 'BITBANK',
    pair: 'BTC/JPY',
    changeBasis: 'rolling24h'
  })
  assert.equal(quoteContext({ market: 'OTHER', symbol: 'BTC' }), null)
})
