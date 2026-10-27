export function finiteNumber(value) {
  if (!['number', 'string'].includes(typeof value)) return NaN
  if (typeof value === 'string' && !value.trim()) return NaN
  const n = Number(typeof value === 'string' ? value.replace(/,/g, '') : value)
  return Number.isFinite(n) ? n : NaN
}

export function positivePrice(value) {
  const n = finiteNumber(value)
  return n > 0 ? n : NaN
}
