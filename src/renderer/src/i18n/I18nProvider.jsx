import { useState, useEffect, useCallback } from 'react'
import { I18nContext } from './context'
import { translate } from '../../../shared/i18n/index.js'
import { detectLanguage, getLanguageInfo } from '../../../shared/languages.js'

export function I18nProvider({ children }) {
  // 첫 화면 깜빡임 방지용 추정치. 곧 main이 준 값으로 교체됨
  const [lang, setLangState] = useState(() => detectLanguage(navigator.language))

  useEffect(() => {
    // 저장된 언어 또는 OS 언어 — 판단은 main이 함 (lang:get)
    window.api
      .getLanguage()
      .then((l) => l && setLangState(l))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const info = getLanguageInfo(lang)
    document.documentElement.lang = info.code
    document.documentElement.dir = info.dir
  }, [lang])

  const setLang = useCallback((l) => {
    setLangState(l)
    window.api.setLanguage(l).catch(() => {})
  }, [])

  const t = useCallback((key, vars) => translate(lang, key, vars), [lang])

  return <I18nContext.Provider value={{ lang, t, setLang }}>{children}</I18nContext.Provider>
}
