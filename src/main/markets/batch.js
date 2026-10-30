import { isNotListed, notListed } from './errors.js'

// 같은 틱에 들어온 시세 요청을 한 번의 다건 조회로 묶는다.
// 갱신 한 번에 코인 N개 → 거래소 요청 1번 (업비트 IP당 초당 10회 제한 대응).
// 없는 코인 하나 때문에 묶음이 통째로 실패하면(ERR_NOT_LISTED) 하나씩 다시 조회해
// 정상 코인은 살리고 문제 코인만 실패시킨다. 요청 제한(429)·타임아웃 같은 다른 실패는
// 다시 조회하면 요청만 몰리므로 묶음 전체를 그대로 실패시킨다.
export function createBatcher(fetchMany, { maxSize = 50 } = {}) {
  let queue = null

  async function run(entries) {
    const symbols = [...new Set(entries.map((e) => e.symbol))]
    let results
    try {
      results = await fetchMany(symbols)
    } catch (batchError) {
      if (symbols.length === 1 || !isNotListed(batchError)) {
        for (const e of entries) e.reject(batchError)
        return
      }
      results = new Map()
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const one = await fetchMany([symbol])
            if (one.has(symbol)) results.set(symbol, one.get(symbol))
          } catch (e) {
            results.set(symbol, e instanceof Error ? e : new Error(String(e)))
          }
        })
      )
    }
    for (const e of entries) {
      const value = results.get(e.symbol)
      if (value instanceof Error) e.reject(value)
      else if (value) e.resolve(value)
      else e.reject(notListed(e.symbol))
    }
  }

  function flush() {
    const entries = queue
    queue = null
    for (let i = 0; i < entries.length; i += maxSize) {
      run(entries.slice(i, i + maxSize)).catch((e) => {
        for (const entry of entries.slice(i, i + maxSize)) entry.reject(e)
      })
    }
  }

  return function load(symbol) {
    return new Promise((resolve, reject) => {
      if (!queue) {
        queue = []
        queueMicrotask(flush)
      }
      queue.push({ symbol, resolve, reject })
    })
  }
}
