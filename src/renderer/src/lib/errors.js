// main이 던진 오류 코드(ERR_*)를 화면 언어로. IPC를 거치면 메시지 앞에 접두어가 붙으므로 코드만 추출.
export function errorText(err, t) {
  const msg = err?.message || String(err)
  const code = msg.match(/ERR_[A-Z_]+/)?.[0]
  return code ? t(`error.${code}`) : msg
}
