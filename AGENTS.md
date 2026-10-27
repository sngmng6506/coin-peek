# AGENTS.md

AI·기여자용 작업 규칙. 사용자 소개는 [README.md](README.md).

## 개요

- Windows·Mac 데스크톱 위젯. 화면 가장자리 hover 시 관심 코인 시세 패널 표시. [stock-peek](https://github.com/sngmng6506/stock-peek)(몰래주식) 포크
- 데이터: 업비트 KRW 마켓, 바이낸스 USDT 마켓 공개 시세 API (키 없음). 바이낸스는 `data-api.binance.vision` 먼저, 실패 시 `api.binance.com`
- 스택: Electron, electron-vite, React 19, `electron-store`
- 계정·거래소 API 키 연동 없음

## 명령

```bash
npm install
npm run dev                    # 개발 실행
npm run lint                   # CI는 --max-warnings 0
npm run check:i18n             # 번역 키·자리표시자 누락 검사
npm test                       # 단위 테스트 (tests/*.test.mjs, Electron 없이 도는 순수 모듈만)
npm run build                  # 번들
npm run build:win              # Windows 설치파일 → dist/
npm run build:mac              # Mac dmg·zip → dist/ (macOS에서만)
npm run build:site             # site/ → website/ 생성
npm run check:site             # website/가 최신인지 검사
```

## 구조

```
src/shared/markets.js     시장(거래소) 정의 (통화·소수 자릿수·심볼 규칙) — main·renderer 공용
src/shared/languages.js   지원 언어 (코드·로케일·방향·시장 순서)
src/shared/i18n/          언어별 번역 (ko.js가 키 기준) — main·renderer 공용
src/main/markets/         거래소 provider (upbit.js, binance.js 팩토리, batch.js 같은 틱 시세 묶음 조회, search.js 목록 검색 순위, index.js 등록)
src/main/index.js         창·트레이·IPC 핸들러·자동 업데이트
src/main/stockService.js  폴링, lastGood 캐시, 시세·보유 병합
src/main/watchlist.js     관심종목 CRUD (검증은 markets.js 규칙)
src/main/preferences.js   도킹·언어·welcome 설정
src/preload/index.js      contextBridge IPC 화이트리스트
src/renderer/src/         App.jsx, components/, i18n/ (Provider), lib/ (금액 포맷·오류 번역)
site/                     웹사이트 원본 (site.json, strings/<lang>.json, pages/<lang>/<page>.html, llms.md)
website/                  생성 결과 — HTML·sitemap·llms.txt 직접 수정 금지 (demo.js, style.css, robots.txt, 이미지는 직접)
scripts/                  prepare-release.mjs, build-site.mjs, check-i18n.mjs, native-smoke.cjs, download_stats.py
```

## 규칙

- HTTP: `eFetch`(`src/main/markets/http.js`, Electron `net.fetch`)만 사용. Node `fetch`는 시스템 프록시·인증서를 무시해 사내망에서 실패
- 시장·언어 하드코딩 금지: `'KR'`, `'원'`, `'ko-KR'` 같은 분기 대신 `src/shared/` 레지스트리와 `lib/format.js` 사용
- 시세 병합: `{...quote, ...holding}` 순서 유지. 사용자 입력(수량·평단)이 API 값에 덮이면 안 됨
- 네트워크 실패: `lastGood` 값 유지 + stale 표시
- 폴링: 코인 시장은 `alwaysOpen`이라 항상 3초. 시세는 거래소별로 한 번에 묶어 조회(`batch.js`, 업비트 IP당 초당 10회 제한). 묶음이 실패하면 심볼별로 다시 조회해 문제 코인만 오류 처리. 차트(90일 일봉) 10분 캐시
- 가격 표기: `autoDecimals` 시장은 유효숫자 4자리까지 소수 확장(최대 8자리). USDT는 ISO 통화가 아니라 `currency: 'USD'` + 입력 라벨 `currencyLabel: 'USDT'`
- 멀티모니터: `displayId` 저장, 해당 모니터 없으면 primary로 폴백
- IPC 추가: `main/index.js` 핸들러와 `preload/index.js` 화이트리스트 둘 다 수정
- UI 문구: `src/shared/i18n/ko.js`에 키 추가 후 모든 언어 파일에 같은 키. `{v}`·`{n}` 자리표시자는 언어 간 동일
- main 오류: 문구 대신 코드(`ERR_*`)로 던지고 화면에서 `error.<CODE>`로 번역
- 미니멀: 기능 추가보다 제거·단순화 우선
- Mac: Apple 서명·공증 없음(ad-hoc). 자동 설치 불가 → `IS_MAC`이면 새 버전 알림 + 다운로드 페이지만. Dock 숨김(`LSUIElement`), 메뉴 막대는 `resources/trayTemplate*.png`
- 사용자 수 집계: 하루 한 번 최신 릴리즈의 `ping-win`/`ping-mac`(1바이트)만 받음 (`dailyPing`). 식별자·사용 정보 전송 금지. 바꾸면 개인정보 페이지 4개 언어·`PRIVACY.md`·`site/llms.md` 같이 수정
- 비밀값: 토큰·계정 ID·인증서 커밋 금지

## 시장·언어 추가

- 시장: `src/shared/markets.js` 항목 → `src/main/markets/index.js` provider 연결 → `market.<ID>`, `add.searchPlaceholder.<ID>` 번역 → `languages.js` 각 언어 `marketOrder`에 추가 → `tests/providers.test.mjs`에 응답 형태 테스트
- 앱 언어: `src/shared/languages.js` 항목 → `src/shared/i18n/<code>.js` → `i18n/index.js` 등록 → `npm run check:i18n`
- 웹 언어: `site/strings/<code>.json` + `site/pages/<code>/*.html` → `npm run build:site`. hreflang·언어 전환·sitemap은 자동

## 배포

| 대상          | 트리거                                      | 방식                                                                                                                                                                                              |
| ------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 앱            | main에 앱 파일 push                         | `release.yml`: 패치 버전 증가 → lint·i18n·테스트 → Win 빌드 → Release → Mac 빌드 자산 추가                                                                                                        |
| 웹사이트      | main에 `website/**` push                    | Cloudflare Pages Git 연동이 자동 배포 (coin-peek.com, Actions 아님)                                                                                                                               |
| 검사          | `src/`·`tests/`·`site/`·`website/` 변경, PR | `check.yml`: lint, 빌드, 단위 테스트, 번역 키, 생성 결과 최신 여부                                                                                                                                |
| Mac 확인      | Release 성공 후 (수동 실행 가능)            | `mac-release-check.yml`: 배포된 zip·dmg를 Apple Silicon·Intel 맥에서 체크섬·universal·ad-hoc 서명·LSUIElement 확인 후 실행 검사 (`SMOKE_APP`). 실행 중 github.com 차단(통계 오염 방지)            |
| 다운로드 배지 | 매일 (수동 실행 가능)                       | `download-badge.yml`: 설치 파일 다운로드 합계(배지) + `ping-*` 관측 간 증가분 → `badges` 브랜치 `downloads.json`·`usage.csv`·`stats-state.json` (실제 구간은 `period_start_utc`~`period_end_utc`) |

- `badges`·`ci-screens` 브랜치는 데이터 저장용 (배지·사용 통계, Mac 스크린샷). 브랜치 정리 때 삭제 금지 (저장소 Rulesets로 삭제 차단)
- 앱 파일: `src/`, `resources/`, `build/`, `package*.json`, `electron-builder.yml` 등. 문서만 바뀌면 릴리즈 안 됨
- 릴리즈 워크플로우가 main에 버전 커밋을 push하므로 작업 전 `git pull`
- 빌드 중 main에 문서만 바뀐 커밋이 들어오면 그 위에 버전 커밋을 다시 올림. 앱 파일이 바뀌었으면 다음 실행에 넘김
- 태그 수동 생성 금지. minor·major는 `package.json` 버전을 최신 태그보다 높여서 push
- 실패 시 재시도: Actions → Release → Run workflow. Windows·Mac 자산을 초안에 올리고 모두 준비된 뒤 공개
- `.gitattributes`(eol=lf) 유지. 없으면 Windows 러너에서 CRLF로 lint 실패
- 웹사이트 버전·갱신일: 릴리즈 때 `sync:version`(= `build-site --touch`)이 `site/site.json`과 `website/`를 갱신해 버전 커밋에 포함
- 웹사이트 수정: `site/` 고치고 `npm run build:site` 후 둘 다 커밋. `website/` 충돌은 손으로 풀지 말고 다시 생성
- CSS·JS 변경 시 `site/site.json`의 `assetVersion` 올리기 (브라우저 캐시 무효화)
- 웹 스타일: 몰래주식(그레이지 종이·잉크)과 일부러 다름. 가넷 바탕·크림 글자·코인 테두리 무늬(`--reed`)·Do Hyeon/Bricolage 제목. 데모 패널은 앱 화면과 같게 유지
- 언어 자동 이동: 기준 언어 홈(`/`)에서만, 브라우저 언어 기준. 직접 고른 언어는 `localStorage cp-lang`

## 체크리스트

- `npm run lint`, `npm run check:i18n`, `npm test`, `npm run build` 통과
- 웹사이트 변경 시 `npm run build:site` 후 `npm run check:site`
- 모든 지원 언어 UI 확인
- 좌·우 도킹 hover 동작 확인
