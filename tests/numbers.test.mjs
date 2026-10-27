import assert from 'node:assert/strict'
import test from 'node:test'
import { finiteNumber, positivePrice } from '../src/main/markets/numbers.js'
test('missing, zero and invalid prices cannot become valid quotes', () => {
  for (const value of [null, undefined, '', ' ', 0, -1, true, [], Infinity]) {
    assert.ok(Number.isNaN(positivePrice(value)))
  }
  assert.equal(positivePrice('1,234.5'), 1234.5)
  assert.equal(finiteNumber(0), 0)
  assert.equal(finiteNumber('-2.5'), -2.5)
})
