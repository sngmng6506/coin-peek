// 처음 설치했을 때의 관심 코인: 화면 언어 사용자가 익숙한 거래소·통화로
const DEFAULTS_BY_LANG = {
  ko: [
    ['UPBIT', 'BTC'],
    ['UPBIT', 'ETH'],
    ['BINANCE', 'BTC'],
    ['BINANCE', 'SOL']
  ],
  ja: [
    ['BITBANK', 'BTC'],
    ['BITBANK', 'ETH'],
    ['BITBANK', 'XRP'],
    ['BINANCE', 'SOL']
  ]
}
const DEFAULTS_OTHER = [
  ['BINANCE', 'BTC'],
  ['BINANCE', 'ETH'],
  ['BINANCE', 'SOL'],
  ['BINANCE', 'XRP']
]

export function defaultItems(lang) {
  return (DEFAULTS_BY_LANG[lang] || DEFAULTS_OTHER).map(([market, symbol]) => ({ market, symbol }))
}

// Pure operations: validate before writing so a failed edit cannot erase holdings.
export function holdingFields(raw) {
  const result = {}
  for (const key of ['quantity', 'avgPrice']) {
    const value = raw?.[key]
    if (value == null || (typeof value === 'string' && !value.trim())) continue
    const n = Number(value)
    if (!['number', 'string'].includes(typeof value) || !Number.isFinite(n) || n <= 0) {
      throw new Error('ERR_INVALID_HOLDING')
    }
    result[key] = n
  }
  return result
}

export function reorderItems(current, order) {
  if (!Array.isArray(order)) throw new Error('ERR_INVALID_ORDER')
  const key = (item) => `${item?.market}-${item?.symbol}`
  const byKey = new Map(current.map((item) => [key(item), item]))
  const seen = new Set()
  const next = []
  for (const item of order) {
    const id = key(item)
    if (!byKey.has(id) || seen.has(id)) continue
    seen.add(id)
    next.push(byKey.get(id))
  }
  // A stale renderer must not remove a stock that was added in the meantime.
  return [...next, ...current.filter((item) => !seen.has(key(item)))]
}
