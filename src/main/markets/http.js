import { net } from 'electron'
import { fetchJsonWith } from './fetchJson.js'

// Electron의 net.fetch → Chromium 네트워크 스택 사용 → 시스템 프록시/인증서 자동 적용.
// Node.js 내장 fetch는 시스템 프록시를 무시하므로 회사 네트워크 등에서 실패할 수 있음.
export function eFetch(url, options = {}) {
  return net.fetch(url, options)
}

// 응답 본문을 읽는 시간까지 제한한다. 타임아웃 후 요청도 취소해 다음 갱신이 막히지 않게 한다.
export function fetchJson(url, options = {}, timeoutMs = 10_000) {
  return fetchJsonWith(eFetch, url, options, timeoutMs)
}

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
