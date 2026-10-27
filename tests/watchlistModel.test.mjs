import assert from 'node:assert/strict'
import test from 'node:test'
import { holdingFields, reorderItems } from '../src/main/watchlistModel.js'

test('reordering retains holdings and does not lose newly added stocks', () => {
  const a = { market: 'US', symbol: 'AAPL', quantity: 10, avgPrice: 150 }
  const b = { market: 'JP', symbol: '7203', quantity: 5, avgPrice: 2000 }
  const c = { market: 'SA', symbol: '2222' }
  assert.deepEqual(reorderItems([a, b, c], [b, { market: 'US', symbol: 'AAPL' }, b]), [b, a, c])
  assert.deepEqual(reorderItems([a], [{ market: 'US', symbol: 'BAD' }]), [a])
})
test('holding validation distinguishes blank from invalid input', () => {
  assert.deepEqual(holdingFields({ quantity: '', avgPrice: ' ' }), {})
  assert.deepEqual(holdingFields({ quantity: '0.5', avgPrice: '150' }), {
    quantity: 0.5,
    avgPrice: 150
  })
  for (const value of [-1, 0, 'abc', Infinity, NaN, true, [], {}]) {
    assert.throws(() => holdingFields({ quantity: value }), /ERR_INVALID_HOLDING/)
  }
})
