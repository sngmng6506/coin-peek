import Sparkline from './Sparkline'
import { useI18n } from '../i18n'
import { displayName, formatMoney, formatNumber, formatRatio } from '../lib/format'

function profitOf(coin) {
  if (!Number.isFinite(coin.price) || !coin.quantity || !coin.avgPrice) return null
  const profit = (coin.price - coin.avgPrice) * coin.quantity
  const ratio = ((coin.price - coin.avgPrice) / coin.avgPrice) * 100
  return { profit, ratio, isUp: profit >= 0 }
}

function CardBtn({ onClick, title, label, className }) {
  return (
    <button
      className={`card-btn ${className || ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {label}
    </button>
  )
}

function CoinCard({ coin, onRemove, onEditHolding }) {
  const { t, lang } = useI18n()
  if (coin.loading) {
    return (
      <div className="card" aria-busy="true">
        <span className="name">{coin.symbol}</span>
        <span className="price">…</span>
      </div>
    )
  }
  if (coin.error) {
    return (
      <div className="card card-err">
        {onRemove && (
          <CardBtn
            onClick={() => onRemove(coin)}
            title={t('card.remove')}
            label="×"
            className="card-remove"
          />
        )}
        <div className="row">
          <span className="name">{coin.symbol}</span>
          <span className="change down">err</span>
        </div>
        <div className="row">
          <span className="err-msg" title={coin.error}>
            {coin.errorCode ? t(`error.${coin.errorCode}`) : coin.error}
          </span>
        </div>
      </div>
    )
  }

  const cls = coin.isUp ? 'up' : 'down'
  const profit = profitOf(coin)
  return (
    <div className="card">
      <div className="card-actions">
        {onEditHolding && (
          <CardBtn
            onClick={() => onEditHolding(coin)}
            title={t('card.editHolding')}
            label="✎"
            className="card-edit"
          />
        )}
        {onRemove && (
          <CardBtn
            onClick={() => onRemove(coin)}
            title={t('card.remove')}
            label="×"
            className="card-remove"
          />
        )}
      </div>
      <div className="row">
        <span className="name" title={coin.symbol}>
          {displayName(coin, lang)}
        </span>
        <span className={`change ${cls}`}>{formatRatio(coin.changeRatio)}</span>
      </div>
      <div className="row">
        <span className="price">
          {coin.stale && (
            <span
              className="stale-dot"
              role="img"
              aria-label={t('card.stale')}
              title={t('card.stale')}
            />
          )}
          <span className="num">{formatMoney(coin.price, coin.market, lang)}</span>
        </span>
        <Sparkline prices={coin.prices} isUp={coin.isUp} />
      </div>
      {profit && (
        <div className="row holding">
          <span className="holding-qty">
            {formatNumber(coin.quantity, lang)} {coin.symbol}
          </span>
          <span className={`holding-profit ${profit.isUp ? 'up' : 'down'}`}>
            <span className="num">
              {formatMoney(profit.profit, coin.market, lang, { signed: true })}
            </span>{' '}
            (<span className="num">{formatRatio(profit.ratio)}</span>)
          </span>
        </div>
      )}
    </div>
  )
}

export default CoinCard
