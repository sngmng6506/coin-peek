# PRIVACY.md

개인정보·데이터 처리 방침. 계정 불필요, 거래소 계정·API 키 연동·주문 기능 없음.

## 로컬 저장 (`electron-store`)

- 관심 코인과 순서
- 보유 수량·평균 매입가
- 패널 위치·모니터
- 언어·welcome 화면 설정

## 네트워크 요청

- 공개 시세 데이터만 업비트·바이낸스 공개 API에 직접 요청 (키·계정 정보 없음)
- 하루 사용자 수 집계: 하루 한 번 GitHub 릴리즈의 1바이트 파일(`ping-win`·`ping-mac`)을 받음. 보내는 정보 없음, 다운로드 수만 집계
- 업데이트 확인용으로 GitHub Releases 조회

## 문의

- [sngmng6506@gmail.com](mailto:sngmng6506@gmail.com)
