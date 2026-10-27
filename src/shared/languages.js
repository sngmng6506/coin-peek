// 지원 언어 — main(트레이·알림·OS 언어 감지)과 renderer(설정 화면)가 함께 사용.
// 언어 추가: 여기에 항목 + src/shared/i18n/<code>.js + src/shared/i18n/index.js 등록.
// dir: 'rtl' 언어(아랍어 등)는 화면 방향 전환 대상. sitePath: 웹사이트 해당 언어 홈 경로.
// marketOrder: 이 언어에서 시장을 보여줄 순서 (주 사용 거래소 먼저). 종목 추가 탭·패널 묶음 순서와 맞춤.
// 빠진 시장은 markets.js 등록 순서로 뒤에 붙음.

export const LANGUAGES = [
  {
    code: 'ko',
    label: '한국어',
    locale: 'ko-KR',
    dir: 'ltr',
    sitePath: '/',
    marketOrder: ['UPBIT', 'BINANCE']
  },
  {
    code: 'en',
    label: 'English',
    locale: 'en-US',
    dir: 'ltr',
    sitePath: '/en',
    marketOrder: ['BINANCE', 'UPBIT']
  },
  {
    code: 'ja',
    label: '日本語',
    locale: 'ja-JP',
    dir: 'ltr',
    sitePath: '/ja',
    marketOrder: ['BINANCE', 'UPBIT']
  },
  {
    code: 'ar',
    label: 'العربية',
    locale: 'ar-SA',
    dir: 'rtl',
    sitePath: '/ar',
    marketOrder: ['BINANCE', 'UPBIT']
  }
]

export const FALLBACK_LANG = 'en'

export function isSupportedLanguage(code) {
  return LANGUAGES.some((l) => l.code === code)
}

export function getLanguageInfo(code) {
  return LANGUAGES.find((l) => l.code === code) || LANGUAGES.find((l) => l.code === FALLBACK_LANG)
}

// OS 로케일('ko-KR', 'ja', 'en-US' …) → 지원 언어 코드
export function detectLanguage(systemLocale) {
  const lc = String(systemLocale || '').toLowerCase()
  const hit = LANGUAGES.find((l) => lc === l.code || lc.startsWith(`${l.code}-`))
  return hit ? hit.code : FALLBACK_LANG
}
