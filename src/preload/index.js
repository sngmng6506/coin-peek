import { contextBridge, ipcRenderer } from 'electron'

// 화면(renderer)이 쓸 수 있는 IPC 전부. 채널을 바꾸면 docs/IPC.md도 함께 수정
const api = {
  startPanelResize: (axis) => ipcRenderer.send('panel:resize-start', axis),
  endPanelResize: () => ipcRenderer.send('panel:resize-end'),
  resetPanelSize: () => ipcRenderer.invoke('panel:reset-size'),
  onPanelResizeEnded: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('panel:resize-ended', handler)
    return () => ipcRenderer.off('panel:resize-ended', handler)
  },
  getQuotes: () => ipcRenderer.invoke('quotes:get-cache'),
  refreshQuotes: () => ipcRenderer.invoke('quotes:refresh'),
  onQuotesUpdate: (cb) => {
    const handler = (_e, data) => cb(data)
    ipcRenderer.on('quotes:update', handler)
    return () => ipcRenderer.off('quotes:update', handler)
  },
  checkWelcome: () => ipcRenderer.invoke('welcome:check'),
  dismissWelcome: () => ipcRenderer.invoke('welcome:dismiss'),
  setPanelHeight: (h) => ipcRenderer.send('panel:set-height', h),
  addCoin: (market, symbol, holding) =>
    ipcRenderer.invoke('watchlist:add', { market, symbol, ...(holding || {}) }),
  updateHolding: (market, symbol, holding) =>
    ipcRenderer.invoke('watchlist:update-holding', {
      market,
      symbol,
      ...(holding || {})
    }),
  searchCoins: (market, keyword) => ipcRenderer.invoke('search:coins', { market, keyword }),
  removeCoin: (market, symbol) => ipcRenderer.invoke('watchlist:remove', { market, symbol }),
  reorderCoins: (items) => ipcRenderer.invoke('watchlist:reorder', items),
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

// sandbox 창이라 preload는 electron 모듈만 쓸 수 있다. 화면에는 이 api만 노출
contextBridge.exposeInMainWorld('api', api)
