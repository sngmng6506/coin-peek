# 할 일

코드로 못 하고 각 서비스 관리 화면에서 직접 해야 하는 작업.

## 첫 릴리즈 전

- [ ] GitHub에 `sngmng6506/coin-peek` 저장소 생성 후 push (Actions 권한: Read and write)
- [ ] `badges` 브랜치 생성 + Rulesets로 삭제 차단 (다운로드 배지·사용 통계용)
- [ ] 실제 앱에서 확인: 업비트 `비트코인`·`BTC` 검색, 바이낸스 `SOL` 검색, 소액 코인(`SHIB`, `PEPE`) 가격 자릿수, 소수 수량 보유 손익
- [ ] 바이낸스 접속이 막힌 네트워크(사내망 등)에서 `api.binance.com` 폴백 동작 확인

## 웹사이트 (coin-peek.com)

- [ ] Cloudflare Worker(Git 연동, `sngmng6506/coin-peek`, 브랜치 `main`, 빌드 명령 비움, 배포 명령 `npx wrangler deploy`) — 설정은 `wrangler.jsonc`
- [ ] Custom domains에 `coin-peek.com`(과 `www.coin-peek.com`) 추가. 도메인이 Cloudflare에 없으면 네임서버를 Cloudflare로 옮기기
- [ ] Google Search Console·네이버 서치어드바이저에 사이트 등록 후 `https://coin-peek.com/sitemap.xml` 제출
