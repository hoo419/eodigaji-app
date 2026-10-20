# 어디가지 베타 실제 서비스 연결

> 역사적 구현 계획입니다. 현재 실행 기준은 [2026-10-20 최신 계획](2026-10-20-current.md)입니다. 아래의 당시 테스트 수·미설치·미연동 문구는 현재 상태를 뜻하지 않습니다.

## 2026-10-20 현재 상태

- 기준: GitHub `4278da0`까지 반영한 로컬 소스와 이번 화면 변경. 아래의 이전 날짜 기록은 당시 결과이다.
- 서비스 중심은 웹·PWA이며 Capacitor Android/iOS 소스도 유지한다.
- 이번 변경: 사용자 제공 노란 로고, 노란 주요 버튼·연노랑 선택 영역·따뜻한 회색 배경, 스크롤을 따라오는 지도.
- 로컬에서 실제 카카오 장소·지도·도보 경로 확인. 자동 테스트 56개 통과, 문법 검사·모바일 웹 자산 빌드 통과.
- 이번 로고·디자인·문서 변경은 아직 커밋·푸시·운영 배포 전이다. 운영 서버의 최신 상태를 오늘 재검증한 것은 아니다.
- 실제 사용자 가입 메일 → 로그인 → 저장 → 재로그인, Android/iPhone 설치와 최신 APK/IPA 검증은 남아 있다.


User authorized connecting the previously disclosed AI, maps, authentication and cloud components.

- [x] Add server-only environment loading and safe public connection status.
- [x] Gemini (free-tier default) and optional OpenAI Responses structured conditions; validate output, disclose unavailable responses, timeouts and sanitized provider errors.
- [x] Kakao REST search and browser map SDK; real coordinates, source links, estimated costs explicitly labelled.
- [x] Supabase email signup/login via server with HttpOnly opaque session cookie; no password persistence. User-scoped profile/course tables with RLS SQL.
- [x] UI connection status, live/demo distinction, genuine login form and live map lifecycle.
- [x] Provider boundary tests, existing regression tests and local connection-status browser check: 18 tests passed.
- [ ] Actual provider calls and cross-user RLS verification: require owner-issued keys, domain registration and executing schema.sql in the owner's Supabase project.

No deployment provider account or billing plan has been created. Missing credentials block actual external verification, not local integration work.
