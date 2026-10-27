// 코인 목록 검색: 티커·이름에서 찾고 정확히 일치 → 앞부분 일치 → 포함 순.
// 같은 순위 안에서는 weight(거래대금 등)가 큰 것부터, 없으면 목록 순서.
export function rankMatches(items, keyword, fieldsOf, { weight = () => 0, limit = 10 } = {}) {
  const kw = String(keyword || '')
    .trim()
    .toLowerCase()
  if (!kw) return []
  const scored = []
  items.forEach((item, index) => {
    let best = Infinity
    for (const raw of fieldsOf(item)) {
      const field = String(raw || '').toLowerCase()
      if (!field) continue
      if (field === kw) best = Math.min(best, 0)
      else if (field.startsWith(kw)) best = Math.min(best, 1)
      else if (field.includes(kw)) best = Math.min(best, 2)
    }
    if (best < Infinity) scored.push({ item, best, w: weight(item) || 0, index })
  })
  scored.sort((a, b) => a.best - b.best || b.w - a.w || a.index - b.index)
  return scored.slice(0, limit).map((s) => s.item)
}
