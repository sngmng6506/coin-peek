import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import StockCard from './components/StockCard'
import ResizeHandles from './components/ResizeHandles'
import { PANEL_BASE_WIDTH } from '../../shared/panelSize.js'
import Icon from './components/Icon'
import AddStockModal from './components/AddStockModal'
import SettingsModal from './components/SettingsModal'
import WelcomeModal from './components/WelcomeModal'
import HoldingEditModal from './components/HoldingEditModal'
import { useI18n } from './i18n'
import { marketOrder } from '../../shared/markets.js'

const idOf = (s) => `${s.market}-${s.symbol}`

// 시장별 묶음 (화면 언어의 기본 시장 먼저, 나머지는 markets.js 순서). 같은 시장 안은 저장 순서
function groupByMarket(stocks, lang) {
  const byMarket = new Map()
  for (const s of stocks) {
    if (!byMarket.has(s.market)) byMarket.set(s.market, [])
    byMarket.get(s.market).push(s)
  }
  return [...byMarket.entries()]
    .sort(([a], [b]) => marketOrder(a, lang) - marketOrder(b, lang))
    .map(([market, items]) => ({ market, items }))
}

function SortableCard({ stock, onRemove, onEditHolding }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: idOf(stock)
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto'
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <StockCard stock={stock} onRemove={onRemove} onEditHolding={onEditHolding} />
    </div>
  )
}

function App() {
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }))
  const scale = viewport.width / PANEL_BASE_WIDTH
  useEffect(() => {
    const update = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const [stocks, setStocks] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [editingHolding, setEditingHolding] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [dockEdge, setDockEdge] = useState('right')
  const [pinned, setPinned] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [sorting, setSorting] = useState(false)
  const { t, lang } = useI18n()
  const panelRef = useRef(null)
  const cardsRef = useRef(null)
  const cardsInnerRef = useRef(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    window.api
      .getStocks()
      .then((data) => {
        if (Array.isArray(data) && data.length) setStocks(data)
      })
      .catch(() => {})
    const unsub = window.api.onStocksUpdate((data) => setStocks(data))
    window.api
      .checkWelcome()
      .then((shouldShow) => {
        if (shouldShow) setShowWelcome(true)
      })
      .catch(() => {})
    window.api
      .getDockEdge()
      .then((edge) => {
        if (edge) setDockEdge(edge)
      })
      .catch(() => {})
    const unsubDock = window.api.onDockEdgeChanged((edge) => setDockEdge(edge))
    window.api
      .getPanelPinned()
      .then((p) => setPinned(!!p))
      .catch(() => {})
    const unsubPin = window.api.onPanelPinnedChanged((p) => setPinned(!!p))
    return () => {
      unsub()
      unsubDock()
      unsubPin()
    }
  }, [])

  useLayoutEffect(() => {
    const panel = panelRef.current
    const inner = cardsInnerRef.current
    if (!panel || !inner) return

    const cardsPadding = 28
    const borderCompensation = 2
    const modalBackdropPadding = 36

    const measure = () => {
      const header = panel.querySelector('.panel-header')
      const headerH = header ? header.offsetHeight : 0
      const innerH = inner.offsetHeight
      let total = headerH + innerH + cardsPadding + borderCompensation

      const modal = panel.querySelector('.modal')
      if (modal) {
        const settingsBody = modal.querySelector('.settings-body')
        const modalRequired = settingsBody
          ? Math.min(
              settingsBody.scrollHeight + modal.querySelector('.settings-header').offsetHeight,
              520
            )
          : modal.scrollHeight + 2 + modalBackdropPadding
        if (modalRequired > total) total = modalRequired
      }

      window.api.setPanelHeight(total)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(inner)
    const modal = panel.querySelector('.modal')
    if (modal) {
      ro.observe(modal)
      modal.querySelectorAll('.settings-section').forEach((section) => ro.observe(section))
    }
    return () => ro.disconnect()
  }, [showAdd, showSettings, showWelcome, editingHolding])

  const handleAdd = async (market, symbol, holding) => {
    await window.api.addStock(market, symbol, holding)
  }

  const handleRemove = async (stock) => {
    await window.api.removeStock(stock.market, stock.symbol)
  }

  const handleEditHolding = (stock) => setEditingHolding(stock)

  const handleSaveHolding = async (holding) => {
    if (!editingHolding) return
    await window.api.updateHolding(editingHolding.market, editingHolding.symbol, holding)
  }

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await window.api.refreshStocks()
    } finally {
      setTimeout(() => setRefreshing(false), 400)
    }
  }

  const handleDragStart = () => setSorting(true)
  const handleDragCancel = () => setSorting(false)

  const handleDragEnd = (event) => {
    setSorting(false)
    const { active, over } = event
    if (!over || active.id === over.id) return
    const marketA = stocks.find((s) => idOf(s) === active.id)?.market
    const marketB = stocks.find((s) => idOf(s) === over.id)?.market
    // 순서 변경은 같은 시장 안에서만
    if (!marketA || marketA !== marketB) return

    const groupA = stocks.filter((s) => s.market === marketA)
    const oldIndex = groupA.findIndex((s) => idOf(s) === active.id)
    const newIndex = groupA.findIndex((s) => idOf(s) === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(groupA, oldIndex, newIndex)

    const next = groupByMarket(stocks, lang).flatMap((g) =>
      g.market === marketA ? reordered : g.items
    )
    setStocks(next)
    window.api.reorderStocks(next.map((s) => ({ market: s.market, symbol: s.symbol })))
  }

  const groups = groupByMarket(stocks, lang)
  const existingKeys = new Set(stocks.map(idOf))

  return (
    <>
      <div
        className={`panel dock-${dockEdge}${sorting ? ' is-sorting' : ''}`}
        ref={panelRef}
        style={{ zoom: scale, width: PANEL_BASE_WIDTH, height: viewport.height / scale }}
      >
        <header className="panel-header">
          <span className="drag-handle" aria-hidden="true" />
          <div className="actions">
            <button
              className={`icon-btn ${refreshing ? 'spinning' : ''}`}
              onClick={handleRefresh}
              title={t('app.refresh')}
              aria-label={t('app.refresh')}
            >
              <Icon name="refresh" />
            </button>
            <button
              className="icon-btn"
              onClick={() => setShowAdd(true)}
              title={t('app.add')}
              aria-label={t('app.add')}
            >
              <Icon name="plus" />
            </button>
            <button
              className="icon-btn"
              onClick={() => setShowSettings(true)}
              title={t('app.settings')}
              aria-label={t('app.settings')}
            >
              <Icon name="settings" />
            </button>
            <button
              className={`icon-btn help-btn ${showHelp ? 'active' : ''}`}
              onClick={() => setShowHelp((v) => !v)}
              title={t('app.help')}
              aria-label={t('app.help')}
              aria-expanded={showHelp}
            >
              <Icon name="help" />
            </button>
            <button
              className={`icon-btn pin-btn ${pinned ? 'pinned' : ''}`}
              onClick={() => {
                if (pinned) {
                  setPinned(false)
                  window.api.unpinPanel()
                } else {
                  setPinned(true)
                  window.api.pinPanel()
                }
              }}
              title={pinned ? t('app.unpin') : t('app.pin')}
              aria-label={pinned ? t('app.unpin') : t('app.pin')}
              aria-pressed={pinned}
            >
              <Icon name="pin" />
            </button>
            <button
              className="icon-btn quit-btn"
              onClick={() => window.api.quitApp()}
              title={t('app.quit')}
              aria-label={t('app.quit')}
            >
              <Icon name="close" />
            </button>
          </div>
        </header>

        {showHelp && (
          <div className="help-popover">
            <div className="help-row">
              <span className="help-icon" aria-hidden="true">
                <Icon name="chart" />
              </span>
              <span>{t('help.chart')}</span>
            </div>
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="cards" ref={cardsRef}>
            <div className="cards-inner" ref={cardsInnerRef}>
              {stocks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-text">{t('app.empty')}</div>
                  <button type="button" className="empty-btn" onClick={() => setShowAdd(true)}>
                    {t('app.emptyAdd')}
                  </button>
                </div>
              ) : (
                <>
                  {groups.map((g, i) => (
                    <Fragment key={g.market}>
                      {i > 0 && <div className="divider" />}
                      <SortableContext
                        items={g.items.map(idOf)}
                        strategy={verticalListSortingStrategy}
                      >
                        {g.items.map((s) => (
                          <SortableCard
                            key={idOf(s)}
                            stock={s}
                            onRemove={handleRemove}
                            onEditHolding={handleEditHolding}
                          />
                        ))}
                      </SortableContext>
                    </Fragment>
                  ))}
                </>
              )}
            </div>
          </div>
        </DndContext>

        {showAdd && (
          <AddStockModal
            onClose={() => setShowAdd(false)}
            onAdd={handleAdd}
            existingKeys={existingKeys}
          />
        )}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
        {editingHolding && (
          <HoldingEditModal
            stock={editingHolding}
            onClose={() => setEditingHolding(null)}
            onSave={handleSaveHolding}
          />
        )}
      </div>
      <ResizeHandles edge={dockEdge} />
    </>
  )
}

export default App
