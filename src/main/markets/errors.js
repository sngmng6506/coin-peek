// 거래소에 없는 코인(상장폐지·오타). 네트워크 오류와 구분해 화면에 다른 문구(error.ERR_NOT_LISTED)를 띄우고,
// 묶음 조회에서는 이 오류일 때만 코인별로 다시 조회해 문제 코인을 떼어 낸다.
export function notListed(detail) {
  const error = new Error(`ERR_NOT_LISTED: ${detail}`)
  error.code = 'ERR_NOT_LISTED'
  return error
}

export const isNotListed = (error) => error?.code === 'ERR_NOT_LISTED'
