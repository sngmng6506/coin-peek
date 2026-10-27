import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchJsonWith } from '../src/main/markets/fetchJson.js'

test('a stalled response body times out and aborts the request', async () => {
  let signal
  const fetchImpl = (_url, options) => {
    signal = options.signal
    return Promise.resolve({ ok: true, status: 200, json: () => new Promise(() => {}) })
  }

  await assert.rejects(fetchJsonWith(fetchImpl, '/quote', {}, 15), /request timeout/)
  assert.equal(signal.aborted, true)
})

test('an HTTP error does not wait for a response body', async () => {
  const result = await fetchJsonWith(
    async () => ({ ok: false, status: 429, json: () => new Promise(() => {}) }),
    '/quote',
    {},
    15
  )
  assert.deepEqual(result, { ok: false, status: 429 })
})
