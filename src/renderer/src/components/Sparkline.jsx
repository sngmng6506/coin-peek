const W = 80
const H = 22
const STROKE = 1.4

function Sparkline({ prices, isUp }) {
  if (!Array.isArray(prices) || prices.length < 2) {
    return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />
  }

  let min = Infinity
  let max = -Infinity
  for (const p of prices) {
    if (p < min) min = p
    if (p > max) max = p
  }
  const range = max - min || 1
  const pad = STROKE
  const innerH = H - pad * 2

  const points = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * (W - pad * 2) + pad
      const y = pad + (1 - (p - min) / range) * innerH
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const stroke = isUp ? '#0F6E56' : '#A32D2D'

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default Sparkline
