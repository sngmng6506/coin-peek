import Store from 'electron-store'
import { normalizePanelSize } from '../shared/panelSize.js'
import { isSupportedLanguage } from '../shared/languages.js'

const store = new Store({
  name: 'preferences',
  defaults: {
    welcomeShown: false,
    dockPosition: { edge: 'right', y: 100, displayId: null },
    language: null, // null이면 OS 언어 자동 감지
    lastPingDate: null // 하루 사용자 수 집계 신호를 마지막으로 보낸 날 (UTC YYYY-MM-DD)
  }
})

export function isWelcomeShown() {
  return Boolean(store.get('welcomeShown'))
}

export function markWelcomeShown() {
  store.set('welcomeShown', true)
}

export function getDockPosition() {
  return store.get('dockPosition', { edge: 'right', y: 100, displayId: null })
}

export function setDockPosition(pos) {
  store.set('dockPosition', pos)
}

export function getLanguage() {
  const lang = store.get('language', null)
  return isSupportedLanguage(lang) ? lang : null
}

export function setLanguage(lang) {
  if (isSupportedLanguage(lang)) store.set('language', lang)
}

export function getLastPingDate() {
  return store.get('lastPingDate', null)
}

export function setLastPingDate(date) {
  store.set('lastPingDate', date)
}

export function getPanelSize() {
  return normalizePanelSize(store.get('panelSize', null))
}

export function setPanelSize(size) {
  store.set('panelSize', normalizePanelSize(size))
}
