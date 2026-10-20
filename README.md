# 어디가지 베타

연인을 위한 데이트·여행 플래너입니다. 웹/PWA와 Capacitor 기반 Android·iOS 프로젝트를 포함합니다.

[설계서 · 화면 구성과 시나리오 흐름도](docs/설계서.md)

## 현재 상태 — 2026-10-14

- 운영 서비스: https://eodigaji-app-production.up.railway.app/
- 저장소: https://github.com/hoo419/eodigaji-app (`master`, 버전 `0.2.0`)
- Railway에 배포되었으며 Gemini AI, 카카오 장소 검색·지도, Supabase 인증·프로필·저장 코스 연결이 구성되어 있습니다.
- 이번 확인: `/api/health`가 `status=ok`, `mode=configured`, `/api/ready`가 `ready=true`를 반환했습니다. `ready`는 환경변수 구성 확인이며 외부 서비스 전체의 동작 검증은 아닙니다.
- 운영 서버의 HTML, app.js, styles.css, pwa.js가 저장소 소스와 일치함을 확인했습니다(줄바꿈 차이 제외).
- 기존 배포 기록에는 실제 카카오 장소 검색, Gemini 코스 생성, 지도 이미지 로드 검증이 포함됩니다. [HANDOFF.md](HANDOFF.md)를 참고하세요.
- 실제 사용자 로그인 → 저장 → 재로그인 후 유지, 인증 메일 복귀 URL, 휴대폰 PWA 설치 확인은 남아 있습니다.

## 주요 기능

- 지역, 데이트/여행, 날짜·시각, 예산, 소요 시간, 분위기, 이동수단, 실내외 조건별 코스 생성
- Gemini 기반 대화형 조건 변경과 추천, OpenAI 대체 공급자 지원
- 카카오 장소 검색·지도와 장소/코스 상세, 도보·대중교통·자동차의 실제 경로 조회
- Supabase 이메일 회원가입·로그인, 계정별 프로필·취향 및 코스 저장/삭제
- 이름·성별·나이·성격·MBTI·관심사 단계별 취향 편집
- 코스 공유, 위치 권한 요청과 지역 직접 선택, PWA 설치 및 공개 오프라인 안내

실시간 영업정보, 날씨, 예약, 정밀한 교통 경로 최적화는 보장하지 않습니다. 비용과 이동시간은 추정값이 포함됩니다. MBTI로 성격을 추론하지 않습니다.

## 로컬 실행

Node.js 22 이상이 필요합니다. 웹 서버는 추가 패키지 설치 없이 실행할 수 있습니다.

```sh
git clone https://github.com/hoo419/eodigaji-app.git
cd eodigaji-app
npm start
```

브라우저에서 `http://127.0.0.1:4173`을 엽니다. 기본 서버는 루프백 주소로 실행하며 `HOST`, `PORT` 환경변수로 변경할 수 있습니다.

서비스 키 없이 실행하면 가상 장소와 규칙 기반 대화의 샘플 모드입니다. 샘플 프로필과 코스는 브라우저 localStorage에 저장됩니다.

실제 서비스 연결은 `.env.example`을 `.env`로 복사하고 [연동 설정 안내](docs/연동-설정.md)에 따라 설정합니다.

| 설정 | 용도 |
|---|---|
| `AI_PROVIDER`, `GEMINI_API_KEY` 또는 `OPENAI_API_KEY` | AI 공급자와 서버 키 |
| `KAKAO_REST_API_KEY`, `KAKAO_JAVASCRIPT_KEY` | 장소 검색 및 도메인 제한 지도 SDK |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | 인증과 사용자 데이터 |
| `APP_ORIGIN` | 인증 메일 복귀 origin |
| `APP_MODE=live` | AI/장소 공급자 미설정 시 샘플 대체 차단 |
| `APP_ALLOWED_ORIGINS` | 모바일 등 추가 허용 origin |

비밀 키는 `.env` 또는 서버 환경변수에만 보관합니다. GitHub 소스와 공개 작업이전 ZIP에는 운영 서버의 비밀 키가 포함되지 않습니다.

## Railway 배포

`Dockerfile`과 `railway.json`을 포함합니다. 컨테이너는 Node.js 24, `HOST=0.0.0.0`, `APP_MODE=live`로 실행하며 준비 확인 경로는 `/api/ready`입니다.

2026-10-14 피드백 수정본부터 Railway 서비스에 GitHub 저장소의 `master` 브랜치를 연결했습니다. **이제 해당 브랜치의 커밋은 운영 서버 자동 배포로 이어집니다.** 배포 이력과 명령은 [HANDOFF.md](HANDOFF.md)에 있습니다. 기존 배포 패키지를 재사용할 때는 먼저 소스를 최신화하세요.

운영 환경변수에서 `APP_ORIGIN=https://eodigaji-app-production.up.railway.app`과 필요한 키를 설정하고 카카오 웹 도메인 및 Supabase 복귀 URL을 확인해야 합니다. 로그인 세션은 메모리에 보관되어 서버 재시작·재배포 시 재로그인이 필요할 수 있습니다. 계정 데이터는 Supabase에 저장됩니다. 서비스 워커는 계정·코스·API를 캐시하지 않습니다. 미사용 시 서버가 잠들 수 있습니다.

## Android·iOS

Android와 iOS 소스가 모두 있습니다. 현재 `mobile/config.json`의 `apiBase`가 비어 있어 모바일은 오프라인 샘플 모드입니다. 운영 서버 연결은 다음 값으로 설정한 뒤 동기화·빌드해야 합니다.

```json
{ "apiBase": "https://eodigaji-app-production.up.railway.app" }
```

```sh
npm ci
npm run android:build
# Mac에서 iOS 동기화·Xcode 열기
npm run ios:sync
npm run ios:open
```

Android 빌드는 Java 21과 Android SDK가 필요합니다. 기존 APK는 최신 웹 배포를 반영한 새 빌드가 아닙니다. iOS는 Xcode 소스를 준비했지만 Windows에서 IPA를 컴파일·서명하지 않았습니다. 실기기 검증은 남아 있습니다.

- [Android 빌드·설치](docs/android.md)
- [iOS 빌드](docs/ios.md)

## 검증과 코드 구조

2026-10-20 로컬 확인: `npm test` **56개 통과**, `npm run check` 통과.

```sh
npm test
npm run check
```

| 경로 | 역할 |
|---|---|
| `public/` | 웹 UI·지도·PWA |
| `server.mjs`, `lib/` | API·추천·서비스 연결·세션 |
| `supabase/` | DB 설정 |
| `mobile/`, `android/`, `ios/` | 모바일 구성과 플랫폼 소스 |
| `tests/` | 추천·인증·서버·모바일·PWA 검증 |
| `HANDOFF.md` | 작업 상태 및 배포 인수인계 |
| `docs/작업이전.md` | 다른 PC·USB로 작업 이전하는 절차 |
| `transfer/` | 공개 소스 작업이전 ZIP |

사진과 일부 글꼴은 외부 자산을 사용하며 로딩 실패 시 대체 표시를 제공합니다.

## 개발 설계 문서

- [기능설계서](docs/기능설계서.md)
- [설계 흐름도](docs/설계흐름도.md)
- [DB 설계도](docs/DB설계도.md)
- [통합 설계서](docs/설계서.md)

## 최신 작업 기준 (2026-10-20)

[현재 개발 계획](docs/superpowers/plans/2026-10-20-current.md)을 참고하세요. 노란 로고·테마·스크롤 추적 지도를 로컬에 적용했습니다. 문법 검사·모바일 웹 자산 빌드와 데스크톱·390px 모바일 스크롤 확인을 마쳤습니다. 이번 변경은 커밋·푸시·운영 반영 전이며 실제 사용자 인증 전체 흐름과 실기기 설치 검증은 남아 있습니다.
