import { getMarket } from '../../shared/markets.js'
import { fetchJson } from './http.js'
import { createUpbitProvider } from './upbit.js'
import { createBinanceProvider } from './binance.js'

// 시장 id → 데이터 provider ({ search(keyword), fetch(symbol) }).
// 시장 메타데이터(통화·소수 자릿수·심볼 규칙)는 src/shared/markets.js.
const PROVIDERS = {
  UPBIT: createUpbitProvider({ fetchJson }),
  BINANCE: createBinanceProvider({ fetchJson })
}

export function getProvider(marketId) {
  const m = getMarket(marketId)
  return m ? PROVIDERS[m.id] || null : null
}
