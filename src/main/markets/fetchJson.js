// 응답 본문을 읽는 시간까지 제한한다. AbortSignal과 타이머를 함께 써
// 네트워크가 취소 요청을 무시하더라도 호출자는 다음 갱신을 진행할 수 있다.
export async function fetchJsonWith(fetchImpl, url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController()
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('request timeout'))
    }, timeoutMs)
  })
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { ...options, signal: controller.signal })
        if (!response.ok) return { ok: false, status: response.status }
        return { ok: true, status: response.status, data: await response.json() }
      })(),
      timeout
    ])
  } finally {
    clearTimeout(timer)
  }
}
