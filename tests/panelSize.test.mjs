import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePanelSize } from '../src/shared/panelSize.js'
test('saved size round trips and invalid/legacy preferences fall back to automatic size', () => {
  const size = { width: 420, height: 650 }
  assert.deepEqual(normalizePanelSize(JSON.parse(JSON.stringify(size))), size)
  for (const v of [
    null,
    undefined,
    {},
    { width: NaN, height: 300 },
    { width: 300, height: Infinity }
  ])
    assert.equal(normalizePanelSize(v), null)
  assert.deepEqual(normalizePanelSize({ width: 1000, height: 0 }), { width: 560, height: 120 })
})
