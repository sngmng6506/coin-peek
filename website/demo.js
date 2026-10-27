// Landing demos. Panel behavior mirrors src/main/index.js:
// 8px edge trigger, 300ms hover delay, 200ms ease-out slide,
// snap to nearest left/right edge 200ms after a drag ends.
// The scripts only move the cursor; the panel reacts like the real app.
;(function () {
  'use strict'

  var HOVER_DELAY = 300
  var SLIDE_MS = 200
  var SNAP_DEBOUNCE = 200
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3)
  }
  // minimum-jerk profile: how people actually move a mouse
  function minJerk(t) {
    return t * t * t * (10 - 15 * t + 6 * t * t)
  }

  function Sim(root, cfg) {
    this.root = root
    this.cfg = cfg
    this.panel = root.querySelector('[data-panel]')
    this.cursor = root.querySelector('[data-cursor]')
    this.indicator = root.querySelector('[data-indicator]')
    this.displayEls = Array.prototype.slice.call(root.querySelectorAll('[data-display]'))
    if (!this.displayEls.length) this.displayEls = [root]
    this.clock = 0
    this.timers = []
    this.tweens = []
    this.running = false
    this.dock = { display: 0, edge: cfg.edge || 'right', y: 0 }
    this.state = 'hidden'
    this.slide = null
    this.hoverEnter = null
    this.dragging = false
    this.snapAt = null
    this.cur = { x: 0, y: 0, down: false }
    this.measure()
  }

  Sim.prototype.measure = function () {
    var r = this.root.getBoundingClientRect()
    var root = this.root
    this.displays = this.displayEls.map(function (el) {
      if (el === root) return { x: 0, y: 0, w: r.width, h: r.height }
      var d = el.getBoundingClientRect()
      return {
        x: d.left - r.left + el.clientLeft,
        y: d.top - r.top + el.clientTop,
        w: el.clientWidth,
        h: el.clientHeight
      }
    })
    this.pw = this.panel.offsetWidth
    this.ph = this.panel.offsetHeight
    if (!this.dockInit) {
      this.dockInit = true
      this.dock.y = this.cfg.dockY(this.displays[this.dock.display], this.ph)
    }
    if (this.px === undefined || this.px === null) this.px = this.hiddenX()
    this.py = this.panelY()
  }

  Sim.prototype.d = function () {
    return this.displays[this.dock.display]
  }
  Sim.prototype.shownX = function () {
    var d = this.d()
    return this.dock.edge === 'left' ? d.x : d.x + d.w - this.pw
  }
  Sim.prototype.hiddenX = function () {
    var d = this.d()
    return this.dock.edge === 'left' ? d.x - this.pw : d.x + d.w
  }
  Sim.prototype.panelY = function () {
    return this.d().y + this.dock.y
  }
  Sim.prototype.trigger = function () {
    var d = this.d()
    var w = this.cfg.trigger || 8
    var x = this.dock.edge === 'left' ? d.x : d.x + d.w - w
    return { x: x, y: this.panelY(), w: w, h: this.ph }
  }

  Sim.prototype.inRect = function (p, r) {
    return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
  }

  Sim.prototype.setState = function (s) {
    if (this.state === s) return
    this.state = s
    this.slide = {
      from: this.px,
      to: s === 'shown' ? this.shownX() : this.hiddenX(),
      t0: this.clock
    }
  }

  // same decision loop as startHoverPolling()
  Sim.prototype.hoverLogic = function () {
    if (this.dragging) return
    var c = this.cur
    var d = this.d()
    var onDisplay = c.x >= d.x && c.x < d.x + d.w && c.y >= d.y && c.y < d.y + d.h
    if (!onDisplay) {
      this.hoverEnter = null
      if (this.state === 'shown') this.setState('hidden')
      return
    }
    var inPanel = this.inRect(c, { x: this.shownX(), y: this.py, w: this.pw, h: this.ph })
    var active = this.inRect(c, this.trigger()) || inPanel
    if (active) {
      if (this.state === 'shown') this.hoverEnter = null
      else {
        if (this.hoverEnter === null) this.hoverEnter = this.clock
        if (this.clock - this.hoverEnter >= HOVER_DELAY) {
          this.hoverEnter = null
          this.setState('shown')
        }
      }
    } else {
      this.hoverEnter = null
      if (this.state === 'shown') this.setState('hidden')
    }
  }

  // same rule as snapToEdge()
  Sim.prototype.snap = function () {
    var cx = this.px + this.pw / 2
    var best = 0
    var bestDist = Infinity
    this.displays.forEach(function (d, i) {
      var dist = cx < d.x ? d.x - cx : cx > d.x + d.w ? cx - d.x - d.w : 0
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    })
    var d = this.displays[best]
    this.dock.display = best
    this.dock.edge = cx < d.x + d.w / 2 ? 'left' : 'right'
    var margin = this.cfg.bottomMargin || 0
    this.dock.y = Math.max(0, Math.min(this.py - d.y, d.h - this.ph - margin))
    this.px = this.shownX()
    this.py = this.panelY()
    this.state = 'shown'
    this.slide = null
    this.dragging = false
    this.panel.classList.toggle('dock-left', this.dock.edge === 'left')
  }

  Sim.prototype.tick = function (dt) {
    this.clock += dt
    var self = this
    this.tweens = this.tweens.filter(function (tw) {
      var t = Math.min(1, (self.clock - tw.t0) / tw.dur)
      tw.step(t)
      if (t >= 1) {
        tw.done()
        return false
      }
      return true
    })
    if (this.dragging && this.following) {
      this.px = this.cur.x - this.grab.x
      this.py = this.cur.y - this.grab.y
    }
    if (this.snapAt !== null && this.clock >= this.snapAt) {
      this.snapAt = null
      this.snap()
    }
    this.hoverLogic()
    if (this.slide) {
      var t = Math.min(1, (this.clock - this.slide.t0) / SLIDE_MS)
      this.px = this.slide.from + (this.slide.to - this.slide.from) * easeOutCubic(t)
      if (t >= 1) this.slide = null
    }
    this.timers = this.timers.filter(function (tm) {
      if (self.clock >= tm.at) {
        tm.fn()
        return false
      }
      return true
    })
    this.render()
  }

  Sim.prototype.render = function () {
    var p = this.panel
    p.style.transform = 'translate(' + this.px.toFixed(2) + 'px,' + this.py.toFixed(2) + 'px)'
    // clip to the docked display unless it is being dragged across screens
    if (this.dragging) p.style.clipPath = 'none'
    else {
      var d = this.d()
      var l = Math.max(0, d.x - this.px)
      var r = Math.max(0, this.px + this.pw - (d.x + d.w))
      p.style.clipPath = 'inset(0 ' + r.toFixed(2) + 'px 0 ' + l.toFixed(2) + 'px)'
    }
    var hidden = this.state === 'hidden' && !this.slide && !this.dragging
    if (this.indicator) {
      var tr = this.trigger()
      var iw = this.indicator.offsetWidth
      var ix = this.dock.edge === 'left' ? tr.x : tr.x + tr.w - iw
      this.indicator.style.transform =
        'translate(' + ix + 'px,' + (this.panelY() + (this.cfg.indicatorOffset || 0)) + 'px)'
      this.indicator.classList.toggle('is-visible', hidden)
      this.indicator.classList.toggle('is-hover', hidden && this.inRect(this.cur, tr))
    }
    this.cursor.style.transform =
      'translate(' + this.cur.x.toFixed(2) + 'px,' + this.cur.y.toFixed(2) + 'px)'
    this.cursor.classList.toggle('is-down', this.cur.down)
    if (this.cfg.onRender) this.cfg.onRender(this)
  }

  // ---- 실제 마우스 모드: 페이지를 보는 사람의 마우스로 같은 판정 로직을 돌림 ----
  Sim.prototype.goLive = function () {
    if (this.live) return
    this.live = true
    this.tweens = []
    this.timers = []
    this.cur.down = false
    this.root.classList.add('is-live')
  }
  Sim.prototype.goScripted = function () {
    if (!this.live) return
    this.live = false
    this.root.classList.remove('is-live')
    var d = this.displays[0]
    this.cur = { x: d.w * 0.34, y: d.h * 0.72, down: false }
    this.restart()
  }

  // ---- script primitives (resolve on the sim clock) ----
  Sim.prototype.wait = function (ms) {
    var self = this
    return new Promise(function (res) {
      self.timers.push({ at: self.clock + ms, fn: res })
    })
  }
  Sim.prototype.moveTo = function (x, y, opts) {
    opts = opts || {}
    var self = this
    var x0 = this.cur.x
    var y0 = this.cur.y
    var dx = x - x0
    var dy = y - y0
    var dist = Math.sqrt(dx * dx + dy * dy)
    // Fitts-like duration, slower while dragging
    var dur = opts.dur || Math.max(260, Math.min(1100, 240 + dist * (opts.slow ? 3.2 : 2.2)))
    // slight arc, like a wrist pivot
    var bend = (opts.bend === undefined ? 0.12 : opts.bend) * dist
    var cx = x0 + dx / 2 - (dy / (dist || 1)) * bend
    var cy = y0 + dy / 2 + (dx / (dist || 1)) * bend
    return new Promise(function (res) {
      self.tweens.push({
        t0: self.clock,
        dur: dur,
        step: function (t) {
          var e = minJerk(t)
          var u = 1 - e
          self.cur.x = u * u * x0 + 2 * u * e * cx + e * e * x
          self.cur.y = u * u * y0 + 2 * u * e * cy + e * e * y
        },
        done: res
      })
    })
  }
  Sim.prototype.press = function () {
    this.cur.down = true
    this.dragging = true
    this.hoverEnter = null
    this.slide = null
    this.following = true
    this.grab = { x: this.cur.x - this.px, y: this.cur.y - this.py }
    return this.wait(120)
  }
  Sim.prototype.release = function () {
    // window stops moving; still "dragging" until the debounce snaps it
    this.cur.down = false
    this.following = false
    this.snapAt = this.clock + SNAP_DEBOUNCE
    return this.wait(SNAP_DEBOUNCE + 60)
  }

  Sim.prototype.start = function (script) {
    var self = this
    var last = null
    function frame(ts) {
      if (!self.running) {
        last = null
        return
      }
      var dt = last === null ? 16 : Math.min(50, ts - last)
      last = ts
      self.tick(dt)
      requestAnimationFrame(frame)
    }
    // 실제 마우스 모드에서 돌아올 때 새 루프로 다시 시작. 끊긴 옛 루프는 gen이 달라 멈춤
    var gen = 0
    function loop(g) {
      if (g !== gen || self.live) return
      script(self).then(function () {
        loop(g)
      })
    }
    self.restart = function () {
      gen += 1
      loop(gen)
    }
    var io = new IntersectionObserver(function (entries) {
      var vis = entries[0].isIntersecting && !document.hidden
      if (vis && !self.running) {
        self.running = true
        requestAnimationFrame(frame)
      } else if (!vis) self.running = false
    })
    io.observe(this.root)
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) self.running = false
      else if (self.root.getBoundingClientRect().bottom > 0) {
        self.running = true
        requestAnimationFrame(frame)
      }
    })
    window.addEventListener('resize', function () {
      self.px = null
      self.measure()
      self.px = self.state === 'shown' ? self.shownX() : self.hiddenX()
      self.render()
    })
    this.render()
    loop(gen)
  }

  // ---- hero: hover to open, move away to close ----
  var hero = document.querySelector('[data-demo="hover"]')
  if (hero) {
    var hs = new Sim(hero, {
      dockY: function (d) {
        return Math.round(d.h * 0.08)
      },
      indicatorOffset: 30
    })
    if (reduce) {
      hs.state = 'shown'
      hs.px = hs.shownX()
      hs.cur = { x: hs.shownX() + hs.pw * 0.55, y: hs.py + 70, down: false }
      hs.render()
    } else {
      var cards = hero.querySelectorAll('.sp-card')
      var hovered = null
      hs.cfg.onRender = function (s) {
        var hit = null
        if (s.state === 'shown' && !s.slide) {
          for (var i = 0; i < cards.length; i++) {
            var b = cards[i].getBoundingClientRect()
            var r = hero.getBoundingClientRect()
            var cx = s.cur.x + r.left
            var cy = s.cur.y + r.top
            if (cx >= b.left && cx < b.right && cy >= b.top && cy < b.bottom) hit = cards[i]
          }
        }
        if (hit !== hovered) {
          if (hovered) hovered.classList.remove('is-hover')
          if (hit) hit.classList.add('is-hover')
          hovered = hit
        }
      }
      hs.cur = { x: hs.displays[0].w * 0.34, y: hs.displays[0].h * 0.72, down: false }
      if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        var resumeTimer = null
        hero.addEventListener('mousemove', function (e) {
          var r = hero.getBoundingClientRect()
          if (resumeTimer) {
            clearTimeout(resumeTimer)
            resumeTimer = null
          }
          hs.goLive()
          // 테두리(border) 안쪽 좌표로: 데모 화면 기준
          hs.cur.x = e.clientX - r.left - hero.clientLeft
          hs.cur.y = e.clientY - r.top - hero.clientTop
        })
        hero.addEventListener('mouseleave', function () {
          // 화면 밖으로 나간 것으로 처리 → 패널이 들어감. 잠시 뒤 자동 재생으로 복귀
          hs.cur.x = -100
          if (resumeTimer) clearTimeout(resumeTimer)
          resumeTimer = setTimeout(function () {
            resumeTimer = null
            hs.goScripted()
          }, 2500)
        })
      }
      hs.start(function (s) {
        var d = s.displays[0]
        var card = function (i) {
          var b = cards[i].getBoundingClientRect()
          var r = hero.getBoundingClientRect()
          return { x: b.left - r.left + b.width * 0.42, y: b.top - r.top + b.height * 0.45 }
        }
        return s
          .wait(900)
          .then(function () {
            return s.moveTo(d.w - 3, s.panelY() + 52)
          })
          .then(function () {
            return s.wait(700)
          })
          .then(function () {
            var p = card(0)
            return s.moveTo(p.x, p.y, { bend: 0.06 })
          })
          .then(function () {
            return s.wait(1500)
          })
          .then(function () {
            var p = card(2)
            return s.moveTo(p.x + 12, p.y, { bend: -0.05 })
          })
          .then(function () {
            return s.wait(1100)
          })
          .then(function () {
            return s.moveTo(d.w * 0.36, d.h * 0.7, { bend: -0.1 })
          })
          .then(function () {
            return s.wait(1400)
          })
      })
    }
  }

  // ---- feature: drag the panel to another monitor ----
  var drag = document.querySelector('[data-demo="drag"]')
  if (drag) {
    var ds = new Sim(drag, {
      dockY: function (d) {
        return Math.round(d.h * 0.12)
      },
      trigger: 4,
      indicatorOffset: 6,
      bottomMargin: 4
    })
    ds.panel.classList.toggle('dock-left', false)
    if (reduce) {
      ds.state = 'shown'
      ds.px = ds.shownX()
      ds.cur = { x: ds.shownX() + ds.pw / 2, y: ds.py + 4, down: false }
      ds.render()
    } else {
      var d0 = ds.displays[0]
      ds.cur = { x: d0.x + d0.w * 0.45, y: d0.y + d0.h * 0.6, down: false }
      ds.start(function (s) {
        var from = s.d()
        var toIndex = s.dock.display === 0 ? 1 : 0
        var to = s.displays[toIndex]
        var edgeX = s.dock.edge === 'left' ? from.x + 1 : from.x + from.w - 2
        var round = (s.round = (s.round || 0) + 1)
        return s
          .moveTo(edgeX, s.panelY() + s.ph * 0.45)
          .then(function () {
            return s.wait(650)
          })
          .then(function () {
            return s.moveTo(s.px + s.pw / 2, s.py + 3.5, { bend: 0.04 })
          })
          .then(function () {
            return s.wait(220)
          })
          .then(function () {
            return s.press()
          })
          .then(function () {
            // release just short of the target edge so the snap is a small nudge
            var left = toIndex === 1 ? to.x + 5 : to.x + to.w - s.pw - 5
            var top = to.y + to.h * (round % 2 ? 0.3 : 0.14)
            return s.moveTo(left + s.grab.x, top + s.grab.y, { slow: true, bend: -0.08 })
          })
          .then(function () {
            return s.wait(140)
          })
          .then(function () {
            return s.release()
          })
          .then(function () {
            return s.wait(500)
          })
          .then(function () {
            var nd = s.d()
            return s.moveTo(nd.x + nd.w * 0.5, nd.y + nd.h * 0.62, { bend: 0.1 })
          })
          .then(function () {
            return s.wait(1500)
          })
      })
    }
  }
})()

// Download buttons: Windows·Mac pair is always shown; the visitor's OS goes first and filled.
;(function () {
  'use strict'
  var ua = navigator.userAgentData ? navigator.userAgentData.platform : navigator.platform || ''
  var isMac = /mac/i.test(ua) && navigator.maxTouchPoints < 2
  if (!isMac) return
  var base = 'https://github.com/sngmng6506/coin-peek/releases/latest/download/'
  // 상단 메뉴의 단일 다운로드 버튼은 Mac 파일로
  Array.prototype.forEach.call(document.querySelectorAll('[data-dl]'), function (a) {
    a.href = base + 'coin-peek-mac.dmg'
  })
  Array.prototype.forEach.call(document.querySelectorAll('.dl-pair'), function (pair) {
    var win = pair.querySelector('[data-dl-os="win"]')
    var mac = pair.querySelector('[data-dl-os="mac"]')
    if (!win || !mac) return
    pair.insertBefore(mac, win)
    mac.classList.remove('btn-dl-alt')
    win.classList.add('btn-dl-alt')
  })
})()

// 언어 링크를 직접 누르면 그 선택을 기억 → 첫 화면 자동 언어 이동을 더 하지 않음
;(function () {
  'use strict'
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.nav-right a[lang], .foot-links a[lang]')
    if (!a) return
    try {
      localStorage.setItem('cp-lang', a.getAttribute('lang'))
    } catch {
      // 저장소를 못 쓰면 같은 사이트 안 이동(referrer)으로만 판단
    }
  })
})()

// 이 페이지의 진짜 오른쪽 끝: 앱처럼 마우스를 창 끝에 대면 패널이 나오고, 치우면 들어감 (마우스가 있는 데스크톱만)
;(function () {
  'use strict'
  var edge = document.querySelector('[data-edge]')
  if (!edge || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
  var panel = edge.querySelector('[data-edge-panel]')
  var hint = document.querySelector('[data-edge-hint]')
  if (hint) hint.hidden = false
  var TRIGGER = 10 // 창 오른쪽 끝에서 이 거리(px) 안이면 열 준비
  var HOVER_DELAY = 300 // 앱과 같은 대기 시간
  var openTimer = null
  var closeTimer = null
  var open = false
  function setOpen(v) {
    open = v
    edge.classList.toggle('is-open', v)
  }
  document.addEventListener('mousemove', function (e) {
    var right = document.documentElement.clientWidth
    var near = e.clientX >= right - TRIGGER
    edge.classList.toggle('is-near', near && !open)
    if (!open) {
      if (near && !openTimer)
        openTimer = setTimeout(function () {
          openTimer = null
          setOpen(true)
        }, HOVER_DELAY)
      if (!near && openTimer) {
        clearTimeout(openTimer)
        openTimer = null
      }
      return
    }
    var r = panel.getBoundingClientRect()
    var inside = e.clientX >= r.left - 16 && e.clientY >= r.top - 16 && e.clientY <= r.bottom + 16
    if (inside || near) {
      if (closeTimer) {
        clearTimeout(closeTimer)
        closeTimer = null
      }
    } else if (!closeTimer) {
      closeTimer = setTimeout(function () {
        closeTimer = null
        setOpen(false)
      }, HOVER_DELAY)
    }
  })
  // 스크롤만 하고 마우스를 움직이지 않은 경우: 마지막 위치가 패널 밖이면 닫음
  var last = null
  document.addEventListener(
    'mousemove',
    function (e) {
      last = e
    },
    { passive: true }
  )
  window.addEventListener(
    'scroll',
    function () {
      if (!open || !last) return
      var r = panel.getBoundingClientRect()
      if (last.clientX < r.left - 16 && !closeTimer)
        closeTimer = setTimeout(function () {
          closeTimer = null
          setOpen(false)
        }, HOVER_DELAY)
    },
    { passive: true }
  )
  document.documentElement.addEventListener('mouseleave', function () {
    if (openTimer) {
      clearTimeout(openTimer)
      openTimer = null
    }
    edge.classList.remove('is-near')
  })
  // 카드 hover 표시도 앱처럼
  Array.prototype.forEach.call(panel.querySelectorAll('.sp-card'), function (c) {
    c.addEventListener('mouseenter', function () {
      c.classList.add('is-hover')
    })
    c.addEventListener('mouseleave', function () {
      c.classList.remove('is-hover')
    })
  })
})()
