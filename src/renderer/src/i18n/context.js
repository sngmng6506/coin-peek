import { createContext } from 'react'

export const I18nContext = createContext({ lang: 'en', t: (k) => k, setLang: () => {} })
