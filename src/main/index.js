import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  screen,
  shell,
  Tray
} from 'electron'
import { join } from 'path'
import fs from 'node:fs/promises'
import { PANEL_BASE_WIDTH } from '../shared/panelSize.js'
import { panelGeometry, resizedPanelGeometry } from './panelGeometry.js'
import { electronApp, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function resourcePath(name) {
  if (is.dev) return join(process.cwd(), 'resources', name)
  return join(process.resourcesPath, 'app.asar.unpacked', 'resources', name)
}
import {
  startPolling,
  stopPolling,
  getCache,
  subscribe,
  refreshAll,
  reorderCache
} from './stockService.js'
import { addItem, removeItem, reorderWatchlist, seedWatchlist, updateHolding } from './watchlist.js'
import { getProvider } from './markets/index.js'
import { eFetch } from './markets/http.js'
import {
  isWelcomeShown,
  markWelcomeShown,
  getDockPosition,
  setDockPosition,
  getLanguage,
  setLanguage,
  getLastPingDate,
  setLastPingDate,
  getPanelSize,
  setPanelSize
} from './preferences.js'
import electronUpdater from 'electron-updater'
import { detectLanguage, getLanguageInfo } from '../shared/languages.js'
import { translate } from '../shared/i18n/index.js'
const { autoUpdater } = electronUpdater

const PANEL_WIDTH = PANEL_BASE_WIDTH
const PANEL_HEIGHT_INITIAL = 180
const PANEL_HEIGHT_MIN = 120
const PANEL_HEIGHT_BOTTOM_MARGIN = 40
const TRIGGER_WIDTH = 8
const TRIGGER_HEIGHT = 500
const HOVER_DELAY = 300
const POLL_INTERVAL = 50
const ANIM_DURATION = 200
const INDICATOR_WIDTH = 6
const INDICATOR_HEIGHT = 50

let requestedPanelHeight = PANEL_HEIGHT_INITIAL // unscaled content height for automatic mode
let customPanelSize = getPanelSize()
let resizeSession = null
let resizeTimer = null
let displayChangeTimer = null
let mainWindow = null
let indicatorWindow = null
let tray = null
let pollTimer = null
let hoverEnterTime = null
let targetState = 'hidden' // 'hidden' | 'shown'
let cancelAnim = null
let panelLocked = false
let panelPinned = false
let isDragging = false
let dragDebounce = null
let updateInfo = null
let updateReady = null
let updateNotification = null
let notifiedVersion = null

// Mac 빌드는 코드 서명이 없어 Squirrel.Mac 자동 설치가 불가 → 새 버전 알림 + 다운로드 페이지만
const IS_MAC = process.platform === 'darwin'

const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000
const UPDATE_CHECK_ON_OPEN_GAP = 15 * 60 * 1000
let lastUpdateCheck = 0

// 하루 사용자 수 집계: 하루 한 번 최신 릴리즈의 1바이트 파일(ping-win/ping-mac)을 받음.
// 식별자·사용 정보는 보내지 않음. GitHub 다운로드 수의 하루 증가분 = 그날 사용자 수 (download-badge.yml)
const PING_URL = `https://github.com/sngmng6506/coin-peek/releases/latest/download/ping-${IS_MAC ? 'mac' : 'win'}`

async function dailyPing() {
  if (is.dev) return
  const today = new Date().toISOString().slice(0, 10)
  if (getLastPingDate() === today) return
  try {
    const res = await eFetch(PING_URL, { cache: 'no-store' })
    if (res.ok) setLastPingDate(today)
  } catch {
    // 오프라인·사내망 차단 등은 조용히 넘어가고 다음 확인 때 다시 시도
  }
}

function checkForUpdates() {
  dailyPing()
  if (is.dev || updateReady) return
  lastUpdateCheck = Date.now()
  autoUpdater.checkForUpdates().catch(() => {})
}

// 패널을 열 때도 확인하되 15분에 한 번까지만
function checkForUpdatesOnOpen() {
  if (Date.now() - lastUpdateCheck >= UPDATE_CHECK_ON_OPEN_GAP) checkForUpdates()
}

// 저장된 언어 → 없으면 OS 언어 감지. renderer도 이 값을 받아 씀 (lang:get)
function resolveLanguage() {
  return getLanguage() || detectLanguage(app.getLocale())
}

const t = (key, vars) => translate(resolveLanguage(), key, vars)

function downloadPageUrl() {
  return `https://coin-peek.com${getLanguageInfo(resolveLanguage()).sitePath}`
}

function installUpdate() {
  if (IS_MAC) {
    if (updateInfo) shell.openExternal(downloadPageUrl())
    return
  }
  // silent 설치 후 자동 재실행
  if (updateReady) autoUpdater.quitAndInstall(true, true)
}

function notifyUpdate(version) {
  if (!Notification.isSupported() || notifiedVersion === version) return
  notifiedVersion = version
  updateNotification = new Notification({
    title: t('notify.updateTitle', { v: version }),
    body: t(IS_MAC ? 'notify.updateDownload' : 'notify.updateInstall'),
    icon
  })
  updateNotification.on('click', installUpdate)
  updateNotification.show()
}

function getDockedDisplay() {
  const dock = getDock()
  const displays = screen.getAllDisplays()
  // 저장된 displayId의 모니터를 찾되, 없으면(연결 해제 등) primary로 폴백
  if (dock.displayId != null) {
    const found = displays.find((d) => d.id === dock.displayId)
    if (found) return found
  }
  return screen.getPrimaryDisplay()
}

function getDisplayWorkArea() {
  return getDockedDisplay().workArea
}

function getDock() {
  return getDockPosition()
}

function currentGeometry() {
  return panelGeometry(
    getDisplayWorkArea(),
    getDock(),
    customPanelSize?.height ?? requestedPanelHeight,
    customPanelSize?.width ?? PANEL_WIDTH
  )
}

function getHiddenX() {
  return currentGeometry().hiddenX
}

function getShownX() {
  return currentGeometry().shownX
}

function getPanelY() {
  return currentGeometry().y
}

function getIndicatorX() {
  const wa = getDisplayWorkArea()
  const dock = getDock()
  if (dock.edge === 'left') return wa.x
  return wa.x + wa.width - INDICATOR_WIDTH
}

function getIndicatorY() {
  return getPanelY() + 30
}

function animate(from, to, duration, onUpdate, onDone) {
  // NaN 방지: from/to가 유효하지 않으면 즉시 완료
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    onDone && onDone()
    return () => {}
  }
  const start = Date.now()
  let canceled = false
  const tick = () => {
    if (canceled) return
    if (mainWindow && mainWindow.isDestroyed()) return
    const elapsed = Date.now() - start
    const t = Math.min(elapsed / duration, 1)
    const eased = 1 - Math.pow(1 - t, 3)
    onUpdate(Math.round(from + (to - from) * eased))
    if (t < 1) setTimeout(tick, 1000 / 60)
    else onDone && onDone()
  }
  tick()
  return () => {
    canceled = true
  }
}

function safeGetX() {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      const x = mainWindow.getPosition()[0]
      if (Number.isFinite(x)) return x
    }
  } catch {
    // The native window may have closed between the check and the operation.
  }
  return getHiddenX()
}

function safeSetPosition(win, x, y) {
  try {
    if (win && !win.isDestroyed()) {
      win.setPosition(Math.round(x) || 0, Math.round(y) || 0)
    }
  } catch {
    // The native window may have closed between the check and the operation.
  }
}

function showIndicator() {
  if (!indicatorWindow || indicatorWindow.isDestroyed()) return
  safeSetPosition(indicatorWindow, getIndicatorX(), getIndicatorY())
  if (!indicatorWindow.isVisible()) indicatorWindow.show()
}

function hideIndicator() {
  if (!indicatorWindow || indicatorWindow.isDestroyed()) return
  if (indicatorWindow.isVisible()) indicatorWindow.hide()
}

function setTarget(state) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (targetState === state && !cancelAnim) return
  const prev = targetState
  targetState = state
  if (state === 'shown' && prev !== 'shown') startPolling()
  if (state === 'hidden' && prev !== 'hidden') stopPolling()
  if (cancelAnim) cancelAnim()
  const y = getPanelY()

  if (state === 'shown') {
    checkForUpdatesOnOpen()
    hideIndicator()
    if (!mainWindow.isVisible()) {
      safeSetPosition(mainWindow, getHiddenX(), y)
      mainWindow.show()
    }
    const fromX = safeGetX()
    const toX = getShownX()
    if (fromX === toX) {
      cancelAnim = null
      return
    }
    cancelAnim = animate(
      fromX,
      toX,
      ANIM_DURATION,
      (x) => safeSetPosition(mainWindow, x, y),
      () => {
        cancelAnim = null
      }
    )
  } else {
    const fromX = safeGetX()
    const toX = getHiddenX()
    if (fromX === toX || !mainWindow.isVisible()) {
      mainWindow.hide()
      showIndicator()
      cancelAnim = null
      return
    }
    cancelAnim = animate(
      fromX,
      toX,
      ANIM_DURATION,
      (x) => safeSetPosition(mainWindow, x, y),
      () => {
        cancelAnim = null
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
        showIndicator()
      }
    )
  }
}

function getCurrentPanelHeight() {
  if (!mainWindow) return PANEL_HEIGHT_INITIAL
  return mainWindow.getSize()[1]
}

function isOnDockedDisplay(cursor) {
  const wa = getDisplayWorkArea()
  return (
    cursor.x >= wa.x &&
    cursor.x < wa.x + wa.width &&
    cursor.y >= wa.y &&
    cursor.y < wa.y + wa.height
  )
}

function isInTriggerZone(cursor) {
  if (!isOnDockedDisplay(cursor)) return false
  const wa = getDisplayWorkArea()
  const dock = getDock()
  const y = getPanelY()
  if (dock.edge === 'left') {
    return (
      cursor.x >= wa.x &&
      cursor.x < wa.x + TRIGGER_WIDTH &&
      cursor.y >= y &&
      cursor.y <= y + TRIGGER_HEIGHT
    )
  }
  return (
    cursor.x >= wa.x + wa.width - TRIGGER_WIDTH &&
    cursor.x < wa.x + wa.width &&
    cursor.y >= y &&
    cursor.y <= y + TRIGGER_HEIGHT
  )
}

function isInPanelArea(cursor) {
  if (!mainWindow) return false
  if (targetState !== 'shown') return false
  if (!isOnDockedDisplay(cursor)) return false
  const shownX = getShownX()
  return (
    cursor.x >= shownX &&
    cursor.x < shownX + mainWindow.getSize()[0] &&
    cursor.y >= getPanelY() &&
    cursor.y <= getPanelY() + getCurrentPanelHeight()
  )
}

function startHoverPolling() {
  pollTimer = setInterval(() => {
    if (!mainWindow) return
    if (isDragging || resizeSession) return

    const cursor = screen.getCursorScreenPoint()

    if (!isOnDockedDisplay(cursor)) {
      hoverEnterTime = null
      if (targetState === 'shown' && !panelPinned && !panelLocked) setTarget('hidden')
      return
    }

    const active = isInTriggerZone(cursor) || isInPanelArea(cursor) || panelLocked || panelPinned

    if (active) {
      if (targetState === 'shown') {
        hoverEnterTime = null
      } else {
        if (hoverEnterTime === null) hoverEnterTime = Date.now()
        if (Date.now() - hoverEnterTime >= HOVER_DELAY) {
          hoverEnterTime = null
          setTarget('shown')
        }
      }
    } else {
      hoverEnterTime = null
      if (targetState === 'shown') setTarget('hidden')
    }
  }, POLL_INTERVAL)
}

// 드래그 종료 시 커서가 위치한 모니터의 가장 가까운 좌/우 edge로 스냅
function snapToEdge() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const pos = mainWindow.getPosition()
  const wx = pos[0] || 0
  const wy = pos[1] || 0

  // 패널 중심점이 속한 모니터를 찾음 (멀티모니터 지원)
  const centerPoint = {
    x: wx + Math.round(mainWindow.getSize()[0] / 2),
    y: wy + 40
  }
  const display = screen.getDisplayNearestPoint(centerPoint)
  const wa = display.workArea

  const centerX = wx + mainWindow.getSize()[0] / 2
  const edge = centerX < wa.x + wa.width / 2 ? 'left' : 'right'
  const newY = Math.max(
    0,
    Math.min(wy - wa.y, wa.height - PANEL_HEIGHT_MIN - PANEL_HEIGHT_BOTTOM_MARGIN)
  )

  // displayId까지 저장 → 다음 실행 및 위치 계산에 사용
  setDockPosition({ edge, y: newY, displayId: display.id })

  // 스냅 위치로 이동
  const toX = getShownX()
  const toY = getPanelY()
  safeSetPosition(mainWindow, toX, toY)

  repositionForDisplays()

  // renderer에 edge 변경 알림
  if (mainWindow.webContents) {
    mainWindow.webContents.send('dock:edge-changed', edge)
  }
}

const INDICATOR_HTML = `<!DOCTYPE html>
<html><head><style>
  html, body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
  .bar {
    width: ${INDICATOR_WIDTH}px;
    height: ${INDICATOR_HEIGHT}px;
    border-radius: 3px;
    background: rgba(120, 160, 220, 0.35);
    box-shadow: 0 0 8px rgba(120, 160, 220, 0.2);
    transition: background 150ms;
  }
  .bar:hover {
    background: rgba(120, 160, 220, 0.6);
  }
</style></head><body><div class="bar"></div></body></html>`

function createIndicatorWindow() {
  indicatorWindow = new BrowserWindow({
    width: INDICATOR_WIDTH,
    height: INDICATOR_HEIGHT,
    x: getIndicatorX(),
    y: getIndicatorY(),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { sandbox: true }
  })
  indicatorWindow.setAlwaysOnTop(true, 'screen-saver')
  indicatorWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: false,
    // macOS: 기본값은 앱을 일반(Foreground) 앱으로 바꿔 Dock에 아이콘이 뜸 → LSUIElement 유지
    skipTransformProcessType: true
  })
  indicatorWindow.setIgnoreMouseEvents(false)
  indicatorWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(INDICATOR_HTML)}`)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: currentGeometry().width,
    height: currentGeometry().height,
    x: getHiddenX(),
    y: getPanelY(),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: false,
    // macOS: 기본값은 앱을 일반(Foreground) 앱으로 바꿔 Dock에 아이콘이 뜸 → LSUIElement 유지
    skipTransformProcessType: true
  })

  // 드래그 감지: will-move → 드래그 시작, 이동 멈추면 스냅
  mainWindow.on('will-move', () => {
    if (resizeSession) return
    if (!isDragging) {
      isDragging = true
      panelLocked = true
      hideIndicator()
    }
  })

  mainWindow.on('move', () => {
    if (!isDragging) return
    if (dragDebounce) clearTimeout(dragDebounce)
    dragDebounce = setTimeout(() => {
      isDragging = false
      panelLocked = false
      snapToEdge()
    }, 200)
  })

  mainWindow.on('blur', finishPanelResize)
  mainWindow.webContents.on('render-process-gone', finishPanelResize)

  mainWindow.on('ready-to-show', () => {
    startHoverPolling()
    if (!isWelcomeShown()) {
      panelLocked = true
      safeSetPosition(mainWindow, getHiddenX(), getPanelY())
      mainWindow.show()
      setTarget('shown')
    } else {
      // 일반 실행: show 없이 polling만 시작 → 에러 방지.
      // indicator만 표시하고 hover 시 패널 노출.
      showIndicator()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function repositionForDisplays() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  finishPanelResize()
  if (cancelAnim) cancelAnim()
  cancelAnim = null
  if (dragDebounce) clearTimeout(dragDebounce)
  if (isDragging) panelLocked = false
  isDragging = false
  const display = getDockedDisplay()
  const dock = getDock()
  const geometry = currentGeometry()
  setDockPosition({ ...dock, y: geometry.offsetY, displayId: display.id })
  mainWindow.setBounds({
    x: targetState === 'shown' ? geometry.shownX : geometry.hiddenX,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height
  })
  safeSetPosition(indicatorWindow, getIndicatorX(), getIndicatorY())
  hoverEnterTime = null
}

function resizePanelTick() {
  if (!resizeSession || !mainWindow || mainWindow.isDestroyed()) return
  const g = resizedPanelGeometry(
    getDisplayWorkArea(),
    getDock(),
    resizeSession,
    screen.getCursorScreenPoint(),
    resizeSession.axis
  )
  customPanelSize = { width: g.width, height: g.height }
  mainWindow.setBounds({ x: g.shownX, y: g.y, width: g.width, height: g.height })
}

function finishPanelResize() {
  if (!resizeSession) return
  clearInterval(resizeTimer)
  resizeTimer = null
  resizeSession = null
  setPanelSize(customPanelSize)
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send('panel:resize-ended')
  }
}

function beginPanelResize(axis) {
  if (!['width', 'height', 'both'].includes(axis) || !mainWindow || targetState !== 'shown') return
  finishPanelResize()
  if (cancelAnim) cancelAnim()
  cancelAnim = null
  if (dragDebounce) clearTimeout(dragDebounce)
  if (isDragging) panelLocked = false
  isDragging = false
  const g = currentGeometry()
  mainWindow.setBounds({ x: g.shownX, y: g.y, width: g.width, height: g.height })
  resizeSession = { ...mainWindow.getBounds(), cursor: screen.getCursorScreenPoint(), axis }
  customPanelSize = { width: resizeSession.width, height: resizeSession.height }
  resizeTimer = setInterval(resizePanelTick, 16)
}

function scheduleDisplayReposition() {
  clearTimeout(displayChangeTimer)
  displayChangeTimer = setTimeout(repositionForDisplays, 100)
}

function applyAutoStart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: []
  })
}

function refreshTrayMenu() {
  if (!tray) return
  const isAuto = app.getLoginItemSettings().openAtLogin
  const template = []
  if (updateReady) {
    template.push({
      label: t('tray.updateApply', { v: updateReady.version }),
      click: installUpdate
    })
    template.push({ type: 'separator' })
  } else if (updateInfo && IS_MAC) {
    template.push({
      label: t('tray.updateOpenPage', { v: updateInfo.version }),
      click: installUpdate
    })
    template.push({ type: 'separator' })
  } else if (updateInfo) {
    template.push({
      label: t('tray.updateDownloading', { v: updateInfo.version }),
      enabled: false
    })
    template.push({ type: 'separator' })
  }
  template.push({
    label: t('tray.autostart'),
    type: 'checkbox',
    checked: isAuto,
    click: (item) => {
      applyAutoStart(item.checked)
      refreshTrayMenu()
    }
  })
  template.push({ type: 'separator' })
  template.push({ label: t('tray.quit'), click: () => app.quit() })
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

function createTray() {
  let img
  if (IS_MAC) {
    // 메뉴 막대용 흑백 템플릿 (@2x는 같은 폴더에서 자동 로드)
    img = nativeImage.createFromPath(resourcePath('trayTemplate.png'))
    img.setTemplateImage(true)
  } else {
    img = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  }
  tray = new Tray(img)
  tray.setToolTip(t('app.name'))
  tray.on('click', () => {
    panelPinned = true
    setTarget('shown')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('panel:pinned-changed', true)
    }
  })
  refreshTrayMenu()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    setTarget('shown')
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.coinpeek.app')
  // 첫 실행이면 화면 언어에 맞는 거래소의 코인으로 시작 (일본어 → bitbank 엔화)
  seedWatchlist(resolveLanguage())
  // 트레이 상주 앱: Mac Dock에 아이콘을 띄우지 않음
  if (IS_MAC) {
    app.dock?.hide()
    // 기본 메뉴(File·View·Window…) 대신 앱 이름·편집만: 입력칸의 복사·붙여넣기 단축키는 편집 메뉴가 있어야 동작
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]))
  }

  ipcMain.handle('stocks:get-cache', () => getCache())
  ipcMain.handle('stocks:refresh', () => refreshAll({ force: true }))

  ipcMain.on('panel:lock', () => {
    panelLocked = true
  })
  ipcMain.on('panel:unlock', () => {
    panelLocked = false
  })

  ipcMain.on('panel:resize-start', (_e, axis) => beginPanelResize(axis))
  ipcMain.on('panel:resize-end', () => {
    resizePanelTick()
    finishPanelResize()
  })
  ipcMain.handle('panel:reset-size', () => {
    finishPanelResize()
    customPanelSize = null
    setPanelSize(null)
    repositionForDisplays()
  })

  ipcMain.on('panel:set-height', (_e, requested) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (!Number.isFinite(requested)) return
    requestedPanelHeight = Math.max(PANEL_HEIGHT_MIN, Math.round(requested))
    if (customPanelSize || resizeSession) return
    const { height: h } = currentGeometry()
    const [w, current] = mainWindow.getSize()
    if (current === h) return
    mainWindow.setSize(w, h)
  })

  // 설정 화면의 "업데이트 확인" 버튼. 새 버전이면 평소처럼 이벤트(다운로드·알림)도 이어짐
  ipcMain.handle('app:check-update', async () => {
    if (updateReady) return { status: 'ready', version: updateReady.version }
    if (is.dev) return { status: 'latest', version: app.getVersion() }
    try {
      lastUpdateCheck = Date.now()
      const result = await autoUpdater.checkForUpdates()
      if (result?.isUpdateAvailable)
        return { status: 'available', version: result.updateInfo.version }
      return { status: 'latest', version: app.getVersion() }
    } catch {
      return { status: 'error' }
    }
  })

  ipcMain.handle('settings:get', () => ({
    autoStart: app.getLoginItemSettings().openAtLogin,
    version: app.getVersion()
  }))
  ipcMain.handle('settings:set-autostart', (_e, enabled) => {
    applyAutoStart(!!enabled)
    refreshTrayMenu()
    return app.getLoginItemSettings().openAtLogin
  })
  ipcMain.handle('settings:get-donate-qr', async () => {
    try {
      const data = await fs.readFile(resourcePath('icon_qr.jpg'))
      return `data:image/jpeg;base64,${data.toString('base64')}`
    } catch {
      return null
    }
  })
  ipcMain.on('shell:open-external', (_e, url) => {
    if (typeof url === 'string' && /^(https?:\/\/|mailto:)/.test(url)) {
      shell.openExternal(url)
    }
  })

  ipcMain.handle('watchlist:add', async (_e, { market, symbol, quantity, avgPrice }) => {
    const list = addItem(market, symbol, { quantity, avgPrice })
    refreshAll()
    return list
  })
  ipcMain.handle('watchlist:update-holding', async (_e, { market, symbol, quantity, avgPrice }) => {
    const list = updateHolding(market, symbol, { quantity, avgPrice })
    refreshAll()
    return list
  })
  ipcMain.handle('watchlist:remove', async (_e, { market, symbol }) => {
    const list = removeItem(market, symbol)
    refreshAll()
    return list
  })

  ipcMain.handle('watchlist:reorder', (_e, items) => {
    const next = reorderWatchlist(items)
    reorderCache(next)
    return next
  })

  ipcMain.handle('welcome:check', () => !isWelcomeShown())
  ipcMain.handle('welcome:dismiss', () => {
    markWelcomeShown()
    panelLocked = false
    return true
  })
  ipcMain.handle('search:stocks', async (_e, { market, keyword }) => {
    const kw = String(keyword || '').trim()
    if (!kw) return []
    const provider = getProvider(market)
    return provider ? await provider.search(kw) : []
  })

  ipcMain.handle('dock:get-edge', () => getDock().edge)

  ipcMain.handle('lang:get', () => resolveLanguage())
  ipcMain.handle('lang:set', (_e, lang) => {
    setLanguage(lang)
    refreshTrayMenu()
    if (tray) tray.setToolTip(t('app.name'))
    return resolveLanguage()
  })

  ipcMain.on('app:quit', () => {
    app.quit()
  })

  ipcMain.on('panel:pin', () => {
    panelPinned = true
    setTarget('shown')
  })
  ipcMain.on('panel:unpin', () => {
    panelPinned = false
  })
  ipcMain.handle('panel:get-pinned', () => panelPinned)

  ipcMain.handle('app:get-update', () => ({
    available: updateInfo,
    ready: updateReady
  }))
  ipcMain.on('app:install-update', installUpdate)

  createWindow()
  createIndicatorWindow()
  createTray()
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
    screen.on(event, scheduleDisplayReposition)
  }

  autoUpdater.autoDownload = !IS_MAC
  autoUpdater.autoInstallOnAppQuit = !IS_MAC
  autoUpdater.on('update-available', (info) => {
    updateInfo = { version: info.version, releaseDate: info.releaseDate, manual: IS_MAC }
    refreshTrayMenu()
    if (IS_MAC) notifyUpdate(info.version)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-available', updateInfo)
    }
  })
  autoUpdater.on('update-downloaded', (info) => {
    updateReady = { version: info.version }
    refreshTrayMenu()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-ready', updateReady)
    }
    notifyUpdate(info.version)
  })
  autoUpdater.on('error', (err) => {
    console.error('autoUpdater error:', err?.message || err)
  })
  if (!is.dev) {
    checkForUpdates()
    setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL)
  }

  subscribe((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stocks:update', data)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  finishPanelResize()
  clearTimeout(displayChangeTimer)
  if (pollTimer) clearInterval(pollTimer)
  if (cancelAnim) cancelAnim()
  if (dragDebounce) clearTimeout(dragDebounce)
  stopPolling()
})
