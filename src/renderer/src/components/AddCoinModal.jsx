import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { marketsFor } from '../../../shared/markets.js'
import { currencySymbol, displayName, examplePrice } from '../lib/format'
import { errorText } from '../lib/errors'
import Dialog from './Dialog'

function AddCoinModal({ onClose, onAdd, existingKeys = new Set() }) {
  const { t, lang } = useI18n()
  const holdingForm = useRef(null)
  const markets = marketsFor(lang)
  const [market, setMarket] = useState(markets[0].id)
  const [keyword, setKeyword] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // step 2: 선택한 종목 + 매수가/수량 입력
  const [selected, setSelected] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [avgPrice, setAvgPrice] = useState('')

  const kw = keyword.trim()
  const currentResult =
    searchResult?.keyword === kw && searchResult?.market === market ? searchResult : null
  const results = kw ? currentResult?.items || [] : []
  const searching = Boolean(kw && !currentResult)
  const searchError = currentResult?.error

  useEffect(() => {
    if (selected || !kw) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const items = await window.api.searchCoins(market, kw)
        if (!cancelled) setSearchResult({ keyword: kw, market, items: items || [] })
      } catch (e) {
        if (!cancelled) {
          setSearchResult({
            keyword: kw,
            market,
            items: [],
            error: errorText(e, t)
          })
        }
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [kw, market, selected, t])

  const handlePick = (item) => {
    setSelected(item)
    setError(null)
  }

  const submitAdd = async (withHolding) => {
    if (!selected || busy) return
    if (withHolding && holdingForm.current?.querySelector('input:invalid')) {
      setError(t('error.ERR_INVALID_HOLDING'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const holding = withHolding
        ? {
            quantity: quantity,
            avgPrice: avgPrice
          }
        : undefined
      await onAdd(selected.market, selected.symbol, holding)
      onClose()
    } catch (err) {
      setError(errorText(err, t))
      setBusy(false)
    }
  }

  return (
    <Dialog onClose={onClose} labelledBy="add-title">
      {!selected ? (
        <>
          <div className="modal-title" id="add-title">
            {t('add.title')}
          </div>

          <div className="seg market-options" role="group" aria-label={t('add.title')}>
            {markets.map((m) => (
              <button
                key={m.id}
                type="button"
                className={market === m.id ? 'active' : ''}
                aria-pressed={market === m.id}
                onClick={() => setMarket(m.id)}
              >
                {t(`market.${m.id}`)}
              </button>
            ))}
          </div>

          <input
            autoFocus
            className="modal-input"
            placeholder={t(`add.searchPlaceholder.${market}`)}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />

          <div className="search-results">
            {searching && <div className="search-hint">{t('add.searching')}</div>}
            {!searching && kw && results.length === 0 && !searchError && (
              <div className="search-hint">{t('add.noResult')}</div>
            )}
            {results.map((r) => {
              const key = `${r.market}-${r.symbol}`
              const exists = existingKeys.has(key)
              return (
                <button
                  key={key}
                  type="button"
                  className="search-item"
                  onClick={() => !exists && handlePick(r)}
                  disabled={busy || exists}
                  title={exists ? t('add.alreadyAddedTitle') : undefined}
                >
                  <span className="search-name">{displayName(r, lang)}</span>
                  <span className="search-meta">
                    {exists ? t('add.alreadyAdded') : `${r.symbol}${r.type ? ` · ${r.type}` : ''}`}
                  </span>
                </button>
              )
            })}
          </div>

          {searchError && <div className="modal-err">{searchError}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              {t('add.close')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="modal-title" id="add-title">
            {t('add.holdingInfo')}
          </div>

          <div className="selected-coin">
            <span className="selected-name">{displayName(selected, lang)}</span>
            <span className="selected-meta">
              {selected.symbol} · {t(`market.${selected.market}`)}
            </span>
          </div>

          <div className="holding-form" ref={holdingForm}>
            <label>
              <span className="form-label">{t('add.quantity')}</span>
              <input
                className="modal-input"
                type="number"
                step="any"
                min="0"
                placeholder={t('holding.qtyPlaceholder')}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              <span className="form-label">
                {t('add.avgPrice')} ({currencySymbol(selected.market, lang)})
              </span>
              <input
                className="modal-input"
                type="number"
                step="any"
                min="0"
                placeholder={t('common.example', { v: examplePrice(selected.market) })}
                value={avgPrice}
                onChange={(e) => setAvgPrice(e.target.value)}
              />
            </label>
          </div>

          <div className="form-hint">{t('holding.hint')}</div>

          {error && <div className="modal-err">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={() => setSelected(null)} disabled={busy}>
              {t('add.back')}
            </button>
            <button type="button" onClick={() => submitAdd(false)} disabled={busy}>
              {t('add.skip')}
            </button>
            <button
              type="button"
              onClick={() => submitAdd(true)}
              disabled={busy || (!quantity && !avgPrice)}
              className="primary"
            >
              {busy ? t('add.adding') : t('add.add')}
            </button>
          </div>
        </>
      )}
    </Dialog>
  )
}

export default AddCoinModal
