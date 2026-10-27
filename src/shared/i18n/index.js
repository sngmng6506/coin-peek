import ko from './ko.js'
import en from './en.js'
import ja from './ja.js'
import ar from './ar.js'
import { FALLBACK_LANG } from '../languages.js'

export const translations = { ko, en, ja, ar }

// 없는 키는 영어 → 한국어 → 키 순으로 대체. {name} 자리는 vars로 채움.
export function translate(lang, key, vars) {
  const text = translations[lang]?.[key] ?? translations[FALLBACK_LANG]?.[key] ?? ko[key] ?? key
  if (!vars) return text
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}
