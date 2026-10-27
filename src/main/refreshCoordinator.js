// 자동·수동 갱신과 목록 편집이 겹쳐도 한 번에 한 묶음만 조회한다.
export function createRefreshCoordinator({ getItems, fetchItem, publish, getCached = () => [] }) {
  let inFlight = null
  let refreshRequested = false
  let forceRequested = false

  return async function refreshAll({ force = false } = {}) {
    refreshRequested = true
    if (force) forceRequested = true
    if (!inFlight) {
      inFlight = (async () => {
        let latest = []
        do {
          refreshRequested = false
          const forceThisRun = forceRequested
          forceRequested = false
          const list = getItems()
          const snapshot = JSON.stringify(list)
          const key = (item) => `${item.market}-${item.symbol}`
          const old = new Map(getCached().map((item) => [key(item), item]))
          const partial = list.map((item) => {
            const cached = old.get(key(item))
            if (!cached) return { ...item, loading: true }
            const quote = { ...cached }
            delete quote.quantity
            delete quote.avgPrice
            return { ...quote, ...item }
          })
          const results = await Promise.all(
            list.map(async (item, index) => {
              const result = await fetchItem(item, { force: forceThisRun })
              partial[index] = result
              // Never publish an obsolete holding/list snapshot or a superseded run.
              if (!refreshRequested && snapshot === JSON.stringify(getItems())) {
                publish([...partial])
              }
              return result
            })
          )
          // 요청 중 목록·보유 정보가 바뀌었으면 이전 결과를 표시하지 않고 다시 조회한다.
          if (snapshot !== JSON.stringify(getItems())) refreshRequested = true
          if (refreshRequested) continue
          latest = results
          if (!list.length) publish(results)
        } while (refreshRequested)
        return latest
      })().finally(() => {
        inFlight = null
      })
    }
    return inFlight
  }
}
