# 어디가지 베타 iPhone 프로젝트 — 0.2.0

현재 iOS 프로젝트는 생성·웹 자산 동기화까지 완료했습니다. Windows에서는 Xcode 컴파일과 IPA 서명을 수행하지 않았습니다. 이 자료는 설치 파일이 아닌 빌드용 소스입니다.

## Mac에서 실행

1. Node.js 22 이상과 Xcode 26 이상을 준비합니다.
2. 프로젝트 폴더에서 `npm ci`를 실행합니다.
3. `npm run ios:sync`를 실행합니다.
4. `npm run ios:open`으로 Xcode 프로젝트를 엽니다.
5. Signing & Capabilities에서 본인의 Apple 개발 팀을 선택합니다.
6. iPhone 또는 시뮬레이터를 선택하고 Run으로 컴파일·실행합니다.
7. 배포용 IPA/TestFlight는 Xcode Archive와 Apple 서명 설정이 필요합니다.

iOS 최소 버전은 15이며 앱 ID는 `com.eodigaji.beta`입니다. 현재 버전은 0.2.0, 빌드 번호는 2입니다. Swift Package Manager를 사용합니다.

## 현재 모바일 모드

`mobile/config.json`의 `apiBase`가 비어 있어 오프라인 샘플로 실행됩니다. 실제 AI, 전국 장소 검색, Supabase 가입·로그인은 공개 HTTPS 서버를 연결한 뒤 다시 동기화·빌드해야 합니다. 비밀 API 키를 iOS 소스나 앱에 복사하지 마세요.

위치 권한 안내 문자열과 플랫폼별 권한 요청을 추가했습니다. iPhone 실기기 실행, 공유·권한 거부·저장, 앱 아이콘/시작 화면 품질 검증은 아직 남아 있습니다.

참고: https://capacitorjs.com/docs/ios
