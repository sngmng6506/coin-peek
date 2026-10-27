import assert from 'node:assert/strict'
import test from 'node:test'
import { panelGeometry } from '../src/main/panelGeometry.js'
test('display changes clamp a tall panel and restore requested height on a larger display', () => {
  const small = panelGeometry(
    { x: -1280, y: 0, width: 1280, height: 720 },
    { edge: 'left', y: 900 },
    800
  )
  assert.equal(small.shownX, -1280)
  assert.ok(small.y + small.height <= 680)
  const large = panelGeometry(
    { x: 0, y: -1080, width: 1920, height: 1080 },
    { edge: 'right', y: 100 },
    800
  )
  assert.equal(large.height, 800)
  assert.equal(large.shownX, 1640)
  assert.equal(large.y, -980)
})

test('resizing keeps the docked edge anchored and uses screen deltas', async () => {
  const { resizedPanelGeometry } = await import('../src/main/panelGeometry.js')
  const area = { x: -1920, y: 0, width: 1920, height: 1080 }
  const start = { width: 280, height: 400, cursor: { x: 100, y: 200 } }
  const right = resizedPanelGeometry(
    area,
    { edge: 'right', y: 100 },
    start,
    { x: 0, y: 300 },
    'both'
  )
  assert.equal(right.width, 380)
  assert.equal(right.height, 500)
  assert.equal(right.shownX + right.width, 0)
  const left = resizedPanelGeometry(
    area,
    { edge: 'left', y: 100 },
    start,
    { x: 200, y: 300 },
    'width'
  )
  assert.equal(left.shownX, -1920)
  assert.equal(left.width, 380)
  assert.equal(left.height, 400)
})

test('resizing clamps minimum, maximum, and available monitor space', async () => {
  const { resizedPanelGeometry } = await import('../src/main/panelGeometry.js')
  const area = { x: 0, y: 0, width: 400, height: 600 }
  const start = { width: 280, height: 300, cursor: { x: 0, y: 0 } }
  const large = resizedPanelGeometry(
    area,
    { edge: 'left', y: 100 },
    start,
    { x: 10000, y: 10000 },
    'both'
  )
  assert.equal(large.width, 400)
  assert.ok(large.height + large.y <= 560)
  const small = resizedPanelGeometry(
    area,
    { edge: 'left', y: 100 },
    start,
    { x: -10000, y: -10000 },
    'both'
  )
  assert.equal(small.width, 240)
  assert.ok(small.height > 0)
})
