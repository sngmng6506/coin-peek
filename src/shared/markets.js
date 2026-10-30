import { getLanguageInfo } from './languages.js'

// 시장 정의 — main(데이터·폴링)과 renderer(표기·탭 순서)가 함께 쓰는 순수 데이터.
// 시장 추가: 여기에 항목 하나 + src/main/markets/index.js에 provider 연결 + 번역 키(market.<ID> 등).
// autoDecimals: 가격 크기에 따라 소수 자릿수를 늘림 (0.00001234 같은 소액 코인).
// localLang: 원어 종목명 언어 (업비트 한글 이름, bitbank 일본어 이름).
// 심볼은 기준 통화를 뺀 코인 티커만 저장 (BTC). 기준 통화는 시장이 정함 (KRW, USDT).
// 배열 순서 = 기본 표시 순서. 화면 언어별 순서는 languages.js marketOrder.

const COIN_SYMBOL = /^[A-Z0-9]{1,15}$/
const normalizeCoin = (quote) => (s) =>
  s
    .toUpperCase()
    .replace(new RegExp(`^${quote}-|${quote}$`), '')
    .replace(/[^A-Z0-9]/g, '')

export const MARKETS = [
  {
    id: 'UPBIT',
    currency: 'KRW',
    quote: 'KRW',
    decimals: 0,
    autoDecimals: true,
    localLang: 'ko', // 업비트 korean_name
    examplePrice: 150000000,
    symbolPattern: COIN_SYMBOL,
    // 'KRW-BTC', 'btc' → 'BTC'
    normalizeSymbol: normalizeCoin('KRW')
  },
  {
    id: 'BINANCE',
    currency: 'USD', // USDT는 ISO 통화 코드가 아니라 Intl 포맷에 못 씀 → 달러 기호로 표기
    currencyLabel: 'USDT',
    quote: 'USDT',
    decimals: 2,
    autoDecimals: true,
    examplePrice: 100000,
    symbolPattern: COIN_SYMBOL,
    // 'BTCUSDT', 'btc' → 'BTC'
    normalizeSymbol: normalizeCoin('USDT')
  },
  {
    id: 'BITBANK',
    currency: 'JPY',
    quote: 'JPY',
    decimals: 0,
    autoDecimals: true,
    localLang: 'ja', // 일본어 코인 이름 (주요 코인만)
    examplePrice: 12000000,
    symbolPattern: COIN_SYMBOL,
    // 'btc_jpy', 'BTC' → 'BTC'
    normalizeSymbol: normalizeCoin('JPY')
  }
]

const BY_ID = new Map(MARKETS.map((m) => [m.id, m]))

export function getMarket(id) {
  return BY_ID.get(String(id || '').toUpperCase()) || null
}

// 정렬 순위: 화면 언어의 marketOrder 순, 거기 없는 시장은 그 뒤에 등록 순서
export function marketOrder(id, lang) {
  const order = (lang && getLanguageInfo(lang).marketOrder) || []
  const j = order.indexOf(id)
  if (j >= 0) return j
  const i = MARKETS.findIndex((m) => m.id === id)
  return order.length + (i < 0 ? MARKETS.length : i)
}

export function marketsFor(lang) {
  return [...MARKETS].sort((a, b) => marketOrder(a.id, lang) - marketOrder(b.id, lang))
}
