import { getMarket } from '../../../shared/markets.js'
import { getLanguageInfo } from '../../../shared/languages.js'

// 금액·숫자 표기. 통화와 자릿수는 시장(src/shared/markets.js), 숫자 모양은 화면 언어를 따름.

// 숫자는 모든 언어에서 라틴 숫자(0-9): 아랍어 화면도 시세·금액은 라틴 숫자가 관례
const formatters = new Map()
function nf(locale, options) {
  const key = locale + JSON.stringify(options)
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, { numberingSystem: 'latn', ...options })
    formatters.set(key, f)
  }
  return f
}

// 한국어 화면의 원화는 관례대로 숫자 뒤에 '원'
const usesWonSuffix = (currency, lang) => currency === 'KRW' && lang === 'ko'

// 소액 코인(0.00001234)은 유효숫자 4자리가 보이도록 소수 자릿수를 늘림. 최대 8자리
const SIGNIFICANT = 4
const MAX_AUTO_DECIMALS = 8
export function fractionDigits(value, market) {
  const digits = market?.decimals ?? 2
  const fixedMax = market?.maxDecimals ?? digits
  const abs = Math.abs(value)
  if (!market?.autoDecimals || !(abs > 0)) return [digits, fixedMax]
  const needed = SIGNIFICANT - 1 - Math.floor(Math.log10(abs))
  return [digits, Math.min(MAX_AUTO_DECIMALS, Math.max(fixedMax, needed))]
}

export function formatMoney(value, marketId, lang, { signed = false } = {}) {
  if (!Number.isFinite(value)) return '—'
  const market = getMarket(marketId)
  const currency = market?.currency || 'USD'
  const [digits, maxDigits] = fractionDigits(value, market)
  const signDisplay = signed ? 'exceptZero' : 'auto'
  if (usesWonSuffix(currency, lang)) {
    return `${nf('ko-KR', { maximumFractionDigits: maxDigits, signDisplay }).format(value)}원`
  }
  // 시장 고유 자릿수 표기(인도 lakh 등)는 영어 화면에서만: 그 시장 사용자가 쓰는 화면 언어
  const locale =
    market?.numberLocale && lang === 'en' ? market.numberLocale : getLanguageInfo(lang).locale
  return nf(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: maxDigits,
    signDisplay
  }).format(value)
}

// 입력칸 라벨용 통화 기호 ('원', 'USDT' …)
export function currencySymbol(marketId, lang) {
  const market = getMarket(marketId)
  if (market?.currencyLabel) return market.currencyLabel
  const currency = market?.currency || 'USD'
  if (usesWonSuffix(currency, lang)) return '원'
  const parts = nf(getLanguageInfo(lang).locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol'
  }).formatToParts(0)
  return parts.find((p) => p.type === 'currency')?.value || currency
}

// 보유 수량. 코인은 0.00012345처럼 소수 8자리까지
export function formatNumber(value, lang) {
  return Number.isFinite(Number(value))
    ? nf(getLanguageInfo(lang).locale, { maximumFractionDigits: 8 }).format(value)
    : '—'
}

export function formatRatio(r) {
  if (!Number.isFinite(r)) return ''
  return `${r > 0 ? '+' : ''}${r.toFixed(2)}%`
}

// 입력 예시용 숫자 (구분 기호 없이: 입력칸에 그대로 칠 수 있게)
export function examplePrice(marketId) {
  const m = getMarket(marketId)
  return m ? m.examplePrice.toFixed(m.decimals) : ''
}

// 종목명: 화면 언어가 시장 원어와 같으면 원어 이름(예: 일본어 UI의 トヨタ自動車), 아니면 기본 이름
export function displayName(stock, lang) {
  if (stock.localName && stock.localLang === lang) return stock.localName
  return stock.name || stock.localName || stock.symbol
}
