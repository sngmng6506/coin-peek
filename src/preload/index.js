import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  startPanelResize: (axis) => ipcRenderer.send('panel:resize-start', axis),
  endPanelResize: () => ipcRenderer.send('panel:resize-end'),
  resetPanelSize: () => ipcRenderer.invoke('panel:reset-size'),
  onPanelResizeEnded: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('panel:resize-ended', handler)
    return () => ipcRenderer.off('panel:resize-ended', handler)
  },
  getStocks: () => ipcRenderer.invoke('stocks:get-cache'),
  refreshStocks: () => ipcRenderer.invoke('stocks:refresh'),
  onStocksUpdate: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('stocks:update', handler)
    return () => ipcRenderer.off('stocks:update', handler)
  },
  checkWelcome: () => ipcRenderer.invoke('welcome:check'),
  dismissWelcome: () => ipcRenderer.invoke('welcome:dismiss'),
  panelLock: () => ipcRenderer.send('panel:lock'),
  panelUnlock: () => ipcRenderer.send('panel:unlock'),
  setPanelHeight: (h) => ipcRenderer.send('panel:set-height', h),
  addStock: (market, symbol, holding) =>
    ipcRenderer.invoke('watchlist:add', { market, symbol, ...(holding || {}) }),
  updateHolding: (market, symbol, holding) =>
    ipcRenderer.invoke('watchlist:update-holding', {
      market,
      symbol,
      ...(holding || {})
    }),
  searchStocks: (market, keyword) => ipcRenderer.invoke('search:stocks', { market, keyword }),
  removeStock: (market, symbol) => ipcRenderer.invoke('watchlist:remove', { market, symbol }),
  reorderStocks: (items) => ipcRenderer.invoke('watchlist:reorder', items),
  getUpdate: () => ipcRenderer.invoke('app:get-update'),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  installUpdate: () => ipcRenderer.send('app:install-update'),
  onUpdateAvailable: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('app:update-available', handler)
    return () => ipcRenderer.off('app:update-available', handler)
  },
  onUpdateReady: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('app:update-ready', handler)
    return () => ipcRenderer.off('app:update-ready', handler)
  },
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setAutoStart: (enabled) => ipcRenderer.invoke('settings:set-autostart', enabled),
  getDonateQr: () => ipcRenderer.invoke('settings:get-donate-qr'),
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
  quitApp: () => ipcRenderer.send('app:quit'),
  pinPanel: () => ipcRenderer.send('panel:pin'),
  unpinPanel: () => ipcRenderer.send('panel:unpin'),
  getPanelPinned: () => ipcRenderer.invoke('panel:get-pinned'),
  onPanelPinnedChanged: (cb) => {
    const handler = (_e, pinned) => cb(pinned)
    ipcRenderer.on('panel:pinned-changed', handler)
    return () => ipcRenderer.off('panel:pinned-changed', handler)
  },
  getDockEdge: () => ipcRenderer.invoke('dock:get-edge'),
  getLanguage: () => ipcRenderer.invoke('lang:get'),
  setLanguage: (lang) => ipcRenderer.invoke('lang:set', lang),
  onDockEdgeChanged: (cb) => {
    const handler = (_e, edge) => cb(edge)
    ipcRenderer.on('dock:edge-changed', handler)
    return () => ipcRenderer.off('dock:edge-changed', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
