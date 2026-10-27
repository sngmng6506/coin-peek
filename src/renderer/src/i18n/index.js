import { useContext } from 'react'
import { I18nContext } from './context'

export { I18nProvider } from './I18nProvider'
export { translations } from '../../../shared/i18n/index.js'

export function useI18n() {
  return useContext(I18nContext)
}
