# IPC 명세

화면(renderer)과 본체(main) 사이의 통신. 화면은 `window.api`(`src/preload/index.js`)만 쓰고, 처리는 `src/main/index.js`의 `ipcMain` 핸들러가 한다. 채널을 추가·변경하면 두 파일과 이 문서를 함께 고친다.

앱과 화면은 항상 같이 배포되므로 채널 이름을 바꿔도 예전 호출자는 없다.

## 공통

- **오류**: `invoke` 채널은 실패하면 `ERR_*` 코드를 메시지로 담아 reject한다. 화면은 `errorText()`(`lib/errors.js`)로 `error.<CODE>` 번역을 보여준다.
- **코인 식별**: `market`(`UPBIT`·`BINANCE`·`BITBANK`, `src/shared/markets.js`) + `symbol`(기준 통화를 뺀 티커, `BTC`). 본체가 `KRW-BTC`, `btcusdt` 같은 입력도 정규화한다.
- **보유 입력**: `quantity`·`avgPrice`는 숫자나 숫자 문자열. 비우면(빈 문자열·`undefined`) 그 값을 지운다. 0 이하·숫자가 아니면 `ERR_INVALID_HOLDING`.

### 시세 객체 (Quote)

`quotes:get-cache`·`quotes:refresh`·`quotes:update`가 관심 목록 순서대로 이 객체의 배열을 준다.

| 필드          | 형식     | 설명                                                                                                                              |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `market`      | string   | 시장 id                                                                                                                           |
| `symbol`      | string   | 티커                                                                                                                              |
| `currency`    | string   | 가격 통화 (`KRW`·`USDT`·`JPY`)                                                                                                    |
| `name`        | string   | 영문 이름 (없으면 티커)                                                                                                           |
| `localName`   | string?  | 원어 이름 (업비트 한글, bitbank 일본어)                                                                                           |
| `localLang`   | string?  | `localName`의 언어 (`ko`·`ja`)                                                                                                    |
| `price`       | number   | 현재가 (> 0)                                                                                                                      |
| `change`      | number   | 기준 대비 변동액. 업비트는 전일(한국 시간 0시), 그 외 24시간 전                                                                   |
| `changeRatio` | number   | 변동률 (%)                                                                                                                        |
| `isUp`        | boolean  | 상승·보합이면 true                                                                                                                |
| `prices`      | number[] | 90일 일봉 종가, 오래된 것부터. 아직 못 받았으면 빈 배열                                                                           |
| `quantity`    | number?  | 사용자 입력 보유 수량 (항상 시세보다 우선)                                                                                        |
| `avgPrice`    | number?  | 사용자 입력 평균 매입가                                                                                                           |
| `stale`       | boolean? | 이번 갱신이 실패해 마지막 정상 시세를 보여주는 중                                                                                 |
| `errorCode`   | string?  | 한 번도 시세를 못 받은 코인만. `ERR_NOT_LISTED`(없는 코인), `ERR_FETCH`(네트워크 등), `ERR_UNKNOWN_MARKET`. 이때 가격 필드는 없음 |

## 관심 목록·시세

| `window.api`                             | 채널                       | 방식   | 입력                                       | 결과                                                                                                                         | 오류                                                                               |
| ---------------------------------------- | -------------------------- | ------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `getQuotes()`                            | `quotes:get-cache`         | invoke | –                                          | `Quote[]` (마지막 갱신값)                                                                                                    | –                                                                                  |
| `refreshQuotes()`                        | `quotes:refresh`           | invoke | –                                          | `Quote[]` (실패 대기 무시하고 새로 조회)                                                                                     | –                                                                                  |
| `onQuotesUpdate(cb)`                     | `quotes:update`            | 수신   | –                                          | `cb(Quote[])`, 해제 함수 반환                                                                                                | –                                                                                  |
| `addCoin(market, symbol, holding?)`      | `watchlist:add`            | invoke | `{ market, symbol, quantity?, avgPrice? }` | 저장된 목록 `{ market, symbol, quantity?, avgPrice? }[]`                                                                     | `ERR_UNKNOWN_MARKET`, `ERR_INVALID_SYMBOL`, `ERR_DUPLICATE`, `ERR_INVALID_HOLDING` |
| `updateHolding(market, symbol, holding)` | `watchlist:update-holding` | invoke | `{ market, symbol, quantity?, avgPrice? }` | 저장된 목록                                                                                                                  | `ERR_NOT_FOUND`, `ERR_INVALID_HOLDING` (실패하면 기존 보유 유지)                   |
| `removeCoin(market, symbol)`             | `watchlist:remove`         | invoke | `{ market, symbol }`                       | 저장된 목록                                                                                                                  | – (없는 코인이면 그대로)                                                           |
| `reorderCoins(items)`                    | `watchlist:reorder`        | invoke | `{ market, symbol }[]` 새 순서             | 저장된 목록                                                                                                                  | `ERR_INVALID_ORDER`. 목록에 없는 항목은 무시, 빠진 항목은 뒤에 유지                |
| `searchCoins(market, keyword)`           | `search:coins`             | invoke | `{ market, keyword }`                      | `{ market, symbol, name, localName?, localLang?, type }[]` (정확히 일치 → 앞부분 일치 → 포함 순). 빈 검색어·없는 시장은 `[]` | `ERR_SEARCH_FAILED`                                                                |

## 패널

| `window.api`                  | 채널                        | 방식   | 입력                              | 결과                 |
| ----------------------------- | --------------------------- | ------ | --------------------------------- | -------------------- |
| `setPanelHeight(h)`           | `panel:set-height`          | send   | 내용 높이(px). 숫자가 아니면 무시 | –                    |
| `startPanelResize(axis)`      | `panel:resize-start`        | send   | `'width'`·`'height'`·`'both'`     | –                    |
| `endPanelResize()`            | `panel:resize-end`          | send   | –                                 | –                    |
| `onPanelResizeEnded(cb)`      | `panel:resize-ended`        | 수신   | –                                 | `cb()`               |
| `resetPanelSize()`            | `panel:reset-size`          | invoke | –                                 | – (자동 크기로)      |
| `pinPanel()` / `unpinPanel()` | `panel:pin` / `panel:unpin` | send   | –                                 | –                    |
| `getPanelPinned()`            | `panel:get-pinned`          | invoke | –                                 | boolean              |
| `onPanelPinnedChanged(cb)`    | `panel:pinned-changed`      | 수신   | –                                 | `cb(boolean)`        |
| `getDockEdge()`               | `dock:get-edge`             | invoke | –                                 | `'left'`·`'right'`   |
| `onDockEdgeChanged(cb)`       | `dock:edge-changed`         | 수신   | –                                 | `cb('left'·'right')` |

## 설정·앱

| `window.api`            | 채널                     | 방식   | 입력      | 결과                                                                                                                  |
| ----------------------- | ------------------------ | ------ | --------- | --------------------------------------------------------------------------------------------------------------------- |
| `getSettings()`         | `settings:get`           | invoke | –         | `{ autoStart, version }`                                                                                              |
| `setAutoStart(enabled)` | `settings:set-autostart` | invoke | boolean   | 실제 적용된 autoStart (boolean)                                                                                       |
| `getLanguage()`         | `lang:get`               | invoke | –         | 언어 코드 (`src/shared/languages.js`)                                                                                 |
| `setLanguage(lang)`     | `lang:set`               | invoke | 언어 코드 | 적용된 언어 코드. 지원하지 않는 코드는 무시하고 현재 언어 반환                                                        |
| `checkWelcome()`        | `welcome:check`          | invoke | –         | 첫 실행 안내를 보여야 하면 true                                                                                       |
| `dismissWelcome()`      | `welcome:dismiss`        | invoke | –         | true                                                                                                                  |
| `getUpdate()`           | `app:get-update`         | invoke | –         | `{ available: { version, releaseDate, manual } \| null, ready: { version } \| null }` (`manual`: Mac은 직접 내려받기) |
| `checkUpdate()`         | `app:check-update`       | invoke | –         | `{ status: 'latest' \| 'available' \| 'ready' \| 'error', version? }`                                                 |
| `onUpdateAvailable(cb)` | `app:update-available`   | 수신   | –         | `cb({ version, releaseDate, manual })`                                                                                |
| `onUpdateReady(cb)`     | `app:update-ready`       | 수신   | –         | `cb({ version })`                                                                                                     |
| `installUpdate()`       | `app:install-update`     | send   | –         | – (Mac은 다운로드 페이지 열기)                                                                                        |
| `openExternal(url)`     | `shell:open-external`    | send   | URL       | – (`http(s):`·`mailto:`만 열고 나머지는 무시)                                                                         |
| `quitApp()`             | `app:quit`               | send   | –         | –                                                                                                                     |
