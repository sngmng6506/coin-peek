// Windows/macOS runner에서 실제 Electron main + preload + renderer를 실행해
// (SMOKE_APP을 주면 빌드 대신 배포된 앱 실행 파일로)
// 일본·사우디 현지어 검색과 시세 공급처 응답을 확인한다.
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { setTimeout: delay } = require('node:timers/promises')

const PORT = 19339
const MAIN_PORT = 19340
// SMOKE_APP: 배포된 앱 실행 파일 (예: Coin Peek.app/Contents/MacOS/Coin Peek). 없으면 out/ 빌드를 Electron으로 실행
const packagedApp = process.env.SMOKE_APP
const smokeData = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-peek-smoke-'))
const bootstrap = packagedApp ? null : path.resolve('out/main/smoke-bootstrap.cjs')
if (bootstrap) {
  fs.writeFileSync(
    bootstrap,
    `globalThis.__smokeElectron = require('electron');
globalThis.__smokeElectron.app.setPath('userData', ${JSON.stringify(smokeData)});
require('./index.js');`
  )
}
const child = spawn(
  packagedApp || require('electron'),
  [
    `--remote-debugging-port=${PORT}`,
    `--inspect=${MAIN_PORT}`,
    '--remote-allow-origins=*',
    ...(packagedApp ? [`--user-data-dir=${smokeData}`] : [bootstrap])
  ],
  { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } }
)
let log = ''
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    log = (log + chunk.toString()).slice(-12_000)
  })
}

// 호출마다 60초 (전체 실행 기준이면 느린 Intel 러너에서 두 번째 호출이 바로 실패)
async function rendererTarget() {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await response.json()
      const page = targets.find(
        (target) => target.type === 'page' && target.url.includes('renderer/index.html')
      )
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      // Electron is still starting.
    }
    await delay(250)
  }
  throw new Error(`Electron renderer did not start (exit ${child.exitCode}).\n${log}`)
}

function evaluate(url, expression, command) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('Renderer smoke timed out'))
    }, 120_000)
    const finish = (error, value) => {
      clearTimeout(timer)
      socket.close()
      if (error) reject(error)
      else resolve(value)
    }
    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: command?.method || 'Runtime.evaluate',
          params: command?.params || { expression, awaitPromise: true, returnByValue: true }
        })
      )
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      if (message.error || message.result?.exceptionDetails) {
        finish(new Error(JSON.stringify(message.error || message.result.exceptionDetails)))
      } else {
        finish(null, message.result?.result?.value)
      }
    })
    socket.addEventListener('error', (error) => finish(error))
  })
}

const probe = `(async () => {
  const until = Date.now() + 20000;
  while ((!window.api || !document.querySelector('.panel')) && Date.now() < until)
    await new Promise(resolve => setTimeout(resolve, 100));
  if (!window.api) throw new Error('Preload API unavailable');
  const up = await window.api.searchCoins('UPBIT', '비트코인');
  const bn = await window.api.searchCoins('BINANCE', 'sol');
  if (!up.some(item => item.symbol === 'BTC')) throw new Error('Upbit search failed');
  if (!bn.some(item => item.symbol === 'SOL')) throw new Error('Binance search failed');
  await window.api.addCoin('UPBIT', 'XRP', { quantity: 10, avgPrice: 2000 });
  await window.api.addCoin('BINANCE', 'DOGE');
  let quotes = await window.api.refreshQuotes();
  const reordered = await window.api.reorderCoins(quotes.map(q => ({market:q.market,symbol:q.symbol})).reverse());
  if (reordered.find(q => q.symbol === 'XRP')?.quantity !== 10) throw new Error('Reorder erased holding');
  let rejected = false;
  try { await window.api.updateHolding('UPBIT', 'XRP', {quantity:-1, avgPrice:2000}); }
  catch { rejected = true; }
  if (!rejected) throw new Error('Invalid holding accepted');
  quotes = await window.api.refreshQuotes();
  if (quotes.find(q => q.symbol === 'XRP')?.quantity !== 10) throw new Error('Invalid edit erased holding');
  // Dismiss welcome in both React and main before exercising settings.
  document.querySelector('.welcome-modal .modal-actions button')?.click();
  await window.api.dismissWelcome();
  document.querySelector('.actions button:nth-child(3)').click();
  await new Promise(resolve => setTimeout(resolve, 200));
  for (const lang of ['ko', 'en', 'ja', 'ar']) {
    const select = document.querySelector('.lang-select');
    if (!select) throw new Error('Settings language selector missing');
    select.value = lang;
    select.dispatchEvent(new Event('change', {bubbles:true}));
    await new Promise(resolve => setTimeout(resolve, 100));
    if (document.documentElement.lang !== lang || document.documentElement.dir !== (lang === 'ar' ? 'rtl' : 'ltr'))
      throw new Error('Language/RTL switch failed: ' + lang);
    const body = document.querySelector('.settings-body');
    const toggle = document.querySelector('.settings-switch');
    if (body.scrollWidth > body.clientWidth || toggle.offsetWidth !== 34)
      throw new Error('Settings layout overflow or invalid switch size: ' + lang);
    if (document.activeElement === document.body)
      throw new Error('Settings focus was lost: ' + lang);

  }
  await new Promise(resolve => setTimeout(resolve, 300));
  return {
    platform: navigator.platform,
    language: document.documentElement.lang,
    markets: ['UPBIT', 'BINANCE'].map(market => {
      const item = quotes.find(q => q.market === market);
      const card = document.querySelector('.card .name[title="' + item?.symbol + '"]')?.closest('.card');
      return { market, symbol: item?.symbol, price: item?.price,
        error: item?.error, cardVisible: Boolean(card) };
    })
  };
})()`

// Exercise real renderer pointer handlers. OS cursor positions are controlled in main
// because CDP pointer dispatch does not move the host cursor on hosted OS runners.
async function checkResize(mainUrl, rendererUrl) {
  const wait = (ms = 250) => delay(ms)
  const mouse = (type, x, y) =>
    evaluate(rendererUrl, null, {
      method: 'Input.dispatchMouseEvent',
      params: { type, x, y, button: 'left', clickCount: 1 }
    })
  const metrics = () =>
    evaluate(
      rendererUrl,
      `(() => {
    const rect = selector => {const r=document.querySelector(selector).getBoundingClientRect(); return {width:r.width,height:r.height,x:r.x,y:r.y}};
    return {width:innerWidth,height:innerHeight, text:rect('.card .name'), graph:rect('.card svg'), button:rect('.icon-btn'),handle:rect('.resize-both')};
  })()`
    )
  await evaluate(rendererUrl, `document.querySelector('.settings-close')?.click()`)
  await wait()
  const results = []
  for (const edge of ['right', 'left']) {
    await evaluate(
      mainUrl,
      `(async () => {
      const {BrowserWindow,screen} = globalThis.__smokeElectron || process.mainModule.require('electron');
      const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('renderer/index.html'));
      globalThis.__resizeWin=win;
      const a=screen.getPrimaryDisplay().workArea;
      win.emit('will-move');
      win.setPosition(${JSON.stringify(edge)}==='left' ? a.x : a.x+a.width-win.getSize()[0], a.y+40);
      win.emit('move');
      await new Promise(r=>setTimeout(r,350));
      globalThis.__resizeOriginalCursor=screen.getCursorScreenPoint;
    })()`
    )
    await evaluate(rendererUrl, `window.api.resetPanelSize()`)
    await wait()
    const before = await metrics()
    await evaluate(
      mainUrl,
      `(() => {
      const {screen}=globalThis.__smokeElectron || process.mainModule.require('electron');
      const b=globalThis.__resizeWin.getBounds();
      globalThis.__resizeStart={x:b.x+${before.handle.x + 5},y:b.y+${before.handle.y + 5}};
      screen.getCursorScreenPoint=()=>globalThis.__resizeStart;
    })()`
    )
    await evaluate(
      rendererUrl,
      `(() => {
      globalThis.__resizeEvents=[];
      for (const type of ['pointerdown','pointerup','pointercancel','lostpointercapture'])
        document.addEventListener(type,e=>globalThis.__resizeEvents.push({type,target:e.target.className}),{once:true});
    })()`
    )
    await mouse('mousePressed', before.handle.x + 5, before.handle.y + 5)
    await wait(100)
    await evaluate(rendererUrl, `window.api.unpinPanel()`)
    await evaluate(
      mainUrl,
      `(() => {
      const {screen}=globalThis.__smokeElectron || process.mainModule.require('electron');
      const start=globalThis.__resizeStart;
      screen.getCursorScreenPoint=()=>({x:start.x+${edge === 'right' ? -100 : 100},y:start.y+100});
    })()`
    )
    await wait(350)
    const after = await metrics()
    const visible = await evaluate(mainUrl, 'globalThis.__resizeWin.isVisible()')
    if (!visible || Math.abs(after.width - before.width - 100) > 2)
      throw new Error(
        'Drag resize/visibility failed: ' +
          JSON.stringify({
            edge,
            before,
            after,
            visible,
            events: await evaluate(rendererUrl, 'globalThis.__resizeEvents'),
            active: await evaluate(rendererUrl, `!!document.querySelector('.resize-handle.active')`)
          })
      )
    const ratio = after.width / before.width
    for (const key of ['text', 'graph', 'button']) {
      if (Math.abs(after[key].height / before[key].height - ratio) > 0.08)
        throw new Error('Contents did not scale: ' + JSON.stringify({ key, before, after }))
    }
    await mouse('mouseReleased', after.handle.x + 5, after.handle.y + 5)
    await evaluate(rendererUrl, 'window.api.pinPanel()')
    await wait()
    const profile = await evaluate(
      mainUrl,
      `(globalThis.__smokeElectron || process.mainModule.require('electron')).app.getPath('userData')`
    )
    const stored = JSON.parse(
      fs.readFileSync(path.join(profile, 'preferences.json'), 'utf8')
    ).panelSize
    if (stored.width !== after.width || stored.height !== after.height)
      throw new Error('Custom size was not saved')
    await evaluate(rendererUrl, `window.api.setPanelHeight(120)`)
    await wait()
    if ((await metrics()).height !== after.height)
      throw new Error('Auto-height overrode manual size')
    await evaluate(
      mainUrl,
      `(() => {const {screen}=globalThis.__smokeElectron || process.mainModule.require('electron');screen.getCursorScreenPoint=globalThis.__resizeOriginalCursor})()`
    )
    await evaluate(rendererUrl, `window.api.resetPanelSize()`)
    await wait()
    if ((await metrics()).width !== 280) throw new Error('Reset size failed')
    const cleared = JSON.parse(
      fs.readFileSync(path.join(profile, 'preferences.json'), 'utf8')
    ).panelSize
    if (cleared !== null) throw new Error('Reset did not clear saved size')
    results.push({ edge, scaledContent: true, storedSize: true, reset: true })
  }
  return results
}

// SMOKE_SHOTS=<폴더>: 언어별 패널 화면(앱이 직접 그린 그대로)과 macOS 전체 화면을 PNG로 저장
async function screenshots(mainUrl, dir) {
  fs.mkdirSync(dir, { recursive: true })
  await evaluate(
    await rendererTarget(),
    `(async () => {
    for (const [m, s] of [['UPBIT','BTC'], ['BINANCE','ETH']])
      await window.api.addCoin(m, s).catch(() => {});
    await window.api.refreshQuotes();
  })()`
  )
  const saved = []
  for (const lang of ['ko', 'en', 'ja', 'ar']) {
    await evaluate(
      await rendererTarget(),
      `(async () => {
      if (!document.querySelector('.lang-select')) document.querySelector('.actions button:nth-child(3)').click();
      await new Promise(r => setTimeout(r, 200));
      const select = document.querySelector('.lang-select');
      select.value = ${JSON.stringify(lang)};
      select.dispatchEvent(new Event('change', {bubbles:true}));
      await new Promise(r => setTimeout(r, 200));
      document.querySelector('.settings-close')?.click();
      await new Promise(r => setTimeout(r, 400));
    })()`
    )
    const png = await evaluate(
      mainUrl,
      `(async () => {
      const {BrowserWindow} = globalThis.__smokeElectron || process.mainModule.require('electron');
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('renderer/index.html'));
      return (await win.webContents.capturePage()).toPNG().toString('base64');
    })()`
    )
    const file = path.join(dir, `panel-${lang}.png`)
    fs.writeFileSync(file, Buffer.from(png, 'base64'))
    saved.push(file)
  }
  if (process.platform === 'darwin') {
    const file = path.join(dir, 'screen.png')
    try {
      require('node:child_process').execFileSync('screencapture', ['-x', file])
      saved.push(file)
    } catch (e) {
      console.error('screencapture failed: ' + e.message)
    }
  }
  return saved
}

;(async () => {
  try {
    const rendererUrl = await rendererTarget()
    const targets = await (await fetch(`http://127.0.0.1:${MAIN_PORT}/json/list`)).json()
    const mainUrl = targets[0].webSocketDebuggerUrl
    // 렌더러 첫 로드가 끝날 때까지 기다린 뒤 검사 (로드 중 평가하면 실행 컨텍스트가 사라짐).
    // 이후 새로고침·이동·종료가 생기면 원인을 로그에 남김
    await evaluate(
      mainUrl,
      `(async () => {
      const {BrowserWindow} = globalThis.__smokeElectron || process.mainModule.require('electron');
      const until = Date.now() + 30000;
      let win;
      while (Date.now() < until) {
        win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('renderer/index.html'));
        if (win && !win.webContents.isLoading()) break;
        await new Promise(r => setTimeout(r, 100));
      }
      if (!win) throw new Error('main window did not load');
      const wc = win.webContents;
      wc.on('render-process-gone', (_e, d) => console.log('[app] render-process-gone ' + JSON.stringify(d)));
      wc.on('did-start-navigation', (d) => console.log('[app] navigation ' + (d.url || d)));
      wc.on('unresponsive', () => console.log('[app] unresponsive'));
      return true;
    })()`
    )
    console.error('[smoke] renderer probe')
    const result = await evaluate(rendererUrl, probe)
    console.error('[smoke] main: auto-hide')
    const native = await evaluate(
      mainUrl,
      `(async () => {
      const {BrowserWindow, screen} = globalThis.__smokeElectron || process.mainModule.require('electron');
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('renderer/index.html'));
      const originalCursor = screen.getCursorScreenPoint;
      const area = screen.getPrimaryDisplay().workArea;
      screen.getCursorScreenPoint = () => ({x:area.x + area.width/2, y:area.y + area.height/2});
      await new Promise(r => setTimeout(r, 600));
      const hidden = !win.isVisible();
      screen.getCursorScreenPoint = originalCursor;
      if (!hidden) throw new Error('Unpinned settings panel did not auto-hide');
      return {settingsAutoHide:true};
    })()`
    )
    console.error('[smoke] renderer: pin')
    await evaluate(await rendererTarget(), `window.api.pinPanel()`)
    console.error('[smoke] main: pinned + display removal')
    const pinned = await evaluate(
      mainUrl,
      `(async () => {
      const {BrowserWindow, screen} = globalThis.__smokeElectron || process.mainModule.require('electron');
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('renderer/index.html'));
      const cursor = screen.getCursorScreenPoint;
      screen.getCursorScreenPoint = () => ({x:-100000, y:-100000});
      await new Promise(r => setTimeout(r, 600));
      const visible = win.isVisible();
      screen.getCursorScreenPoint = cursor;
      if (!visible) throw new Error('Pinned panel was hidden');
      const all = screen.getAllDisplays;
      const primary = screen.getPrimaryDisplay;
      const d = primary();
      const replacement = {...d, id:d.id+10000, workArea:{x:0,y:0,width:800,height:600}};
      try {
        screen.getAllDisplays = () => [replacement];
        screen.getPrimaryDisplay = () => replacement;
        screen.emit('display-removed', {}, d);
        await new Promise(r => setTimeout(r, 350));
        const b = win.getBounds();
        if (b.x < 0 || b.y < 0 || b.x+b.width > 800 || b.y+b.height > 600)
          throw new Error('Display fallback bounds invalid: '+JSON.stringify(b));
      } finally {
        screen.getAllDisplays = all;
        screen.getPrimaryDisplay = primary;
        screen.emit('display-metrics-changed', {}, d, ['workArea']);
      }
      return {pinKeepsVisible:true, simulatedDisplayRemoval:true};
    })()`
    )
    result.native = { ...native, ...pinned }
    result.resize = await checkResize(mainUrl, await rendererTarget())
    if (process.env.SMOKE_SHOTS) {
      console.error('[smoke] screenshots')
      result.shots = await screenshots(mainUrl, process.env.SMOKE_SHOTS)
    }
    for (const market of result.markets) {
      if (!Number.isFinite(market.price) || !market.cardVisible) {
        throw new Error(`Native quote check failed: ${JSON.stringify(result)}\n${log}`)
      }
    }
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error)
    console.error('--- app log ---\n' + log)
    process.exitCode = 1
  } finally {
    child.kill()
    if (bootstrap) fs.rmSync(bootstrap, { force: true })
    // The OS runner also clears the isolated profile if Electron still holds files.
    child.once('exit', () => {
      try {
        fs.rmSync(smokeData, { recursive: true, force: true })
      } catch {
        /* still locked */
      }
    })
  }
})()
