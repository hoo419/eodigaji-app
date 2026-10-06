# 어디가지 베타 Android 앱

기존 화면을 Capacitor 8 Android 프로젝트로 전환했습니다. **설치형 하이브리드 앱**이며 UI와 샘플 추천 기능을 APK 내부에 포함합니다. 브라우저 바로가기나 PC 웹 주소를 띄우는 원격 페이지 구성이 아닙니다. 화면은 WebView 기술로 표시하고 안드로이드 기능은 네이티브 플러그인으로 연결합니다.

2026-09-22 Java/SDK 설치 후 Gradle APK 컴파일에 성공했습니다. `artifacts/eodigaji-beta-debug.apk` (4,855,932 bytes)의 v2 서명, 앱 이름, 패키지 ID, 내장 HTML/JS 파일을 검증했습니다. 실제 안드로이드 기기 실행은 아직 수행하지 않았습니다.

## 앱 구성

- 앱 이름: **어디가지 베타**
- 앱 ID: `com.eodigaji.beta`
- 최소 Android API: 24 (Android 7), compile/target API: 36. 최신 Android System WebView가 필요합니다.
- 첫 실행: 로그인/회원가입 체험 또는 게스트 탐색
- 오프라인 샘플 기능: 조건별 코스 생성, 대화형 조건 수정, 프로필, 저장 코스, 상세 정보
- 네이티브 기능: 뒤로가기, 앱 종료 확인, Android 공유 창, 선택형 위치 권한
- 정확한 위치는 저장하거나 전송하지 않음. 위치 권한 거부 시 직접 지역 선택 가능
- 사진은 외부 이미지를 사용하며 인터넷이 없으면 대체 표시. 기본 글꼴은 시스템 글꼴

## 개발 환경 설치

1. [공식 Android Studio](https://developer.android.com/studio)를 설치합니다. 설치 과정에서 SDK 이용약관을 확인·동의해야 합니다.
2. Android Studio SDK Manager에서 **Android SDK Platform 36**, **Android SDK Build-Tools**, **Android SDK Platform-Tools**를 설치합니다.
3. Java 21은 Android Studio의 호환 JBR 또는 별도 JDK 21을 사용합니다. 빌드 스크립트는 `JAVA_HOME` 또는 기본 Android Studio의 `jbr`를 찾습니다.
4. SDK가 기본 위치(`%LOCALAPPDATA%/Android/Sdk`)가 아니면 `ANDROID_HOME`을 설정합니다.

2026-09-22 사용자의 명시적 동의를 받고 공식 Java 21과 Android SDK Platform 36, Build-Tools 35, Platform-Tools를 프로젝트의 `.tooling/`에 설치했습니다. 공식 SDK 설치 도구에서 약관을 수락했으며 PowerShell 실행 정책은 변경하지 않았습니다. 빌드 스크립트는 이 로컬 설치를 자동으로 찾고 Windows Gradle 캐시는 OneDrive 파일 잠금 문제를 피하도록 `%LOCALAPPDATA%/eodigaji-build/gradle`에 저장합니다.

## APK 생성

프로젝트 폴더에서 다음을 실행합니다.

```sh
npm ci
npm run android:build
```

빌드 성공 시:

```text
artifacts/eodigaji-beta-debug.apk
```

이 APK는 설치/테스트용 debug 서명을 사용합니다. Google Play 배포용 서명·AAB·개인정보처리방침·스토어 심사는 별도입니다. 첫 빌드는 Gradle 및 Android 라이브러리를 다운로드하므로 네트워크와 추가 시간이 필요합니다.

Android Studio로 열려면:

```sh
npm run android:open
```

휴대폰 연결 후 실행은 Android Studio의 Run을 사용합니다. APK 파일을 휴대폰에 복사해서 설치할 수도 있으며 Android에서 해당 파일 제공 앱의 설치 권한을 사용자가 허용해야 합니다. 기기 보안 설정을 이 프로젝트에서 변경하지 않습니다.

## 실제 서버 연결

`mobile/config.json`의 `apiBase`가 빈 문자열이면 앱 내부의 샘플 추천을 사용합니다. 이 경우 PC 서버와 API 키 없이 실행됩니다.

```json
{ "apiBase": "" }
```

실제 서비스를 사용할 때는 운영 서버의 HTTPS origin을 설정한 후 앱을 다시 빌드합니다. 계정 API 요청은 Capacitor의 네이티브 HTTP 전송을 사용합니다. 서버 주소를 클라이언트에 넣는 것과 AI 비밀 키를 넣는 것은 다릅니다. AI·카카오 REST·Supabase 설정은 기존 서버 `.env`에만 보관합니다.

```json
{ "apiBase": "https://YOUR-OWN-API-DOMAIN" }
```

위 예시는 본인이 배포한 실제 주소로 바꿔야 하며 제공된 호스팅 주소가 아닙니다. 휴대폰의 `127.0.0.1`은 PC가 아니라 휴대폰 자체를 가리킵니다. 앱은 HTTPS만 허용하며 앱에서 임의의 HTTP 주소로 보안 설정을 완화하지 않습니다. 카카오 지도 SDK 사용 시 Android WebView origin인 `https://localhost`의 도메인 등록·SDK 이용 조건을 확인해야 합니다.

서버가 연결된 앱에서 회원 인증 쿠키·클라우드 저장·지도 SDK의 실제 기기 동작은 배포 및 키 준비 후 추가 검증이 필요합니다. API 실패 시 샘플 성공으로 숨기지 않습니다.

## 파일 역할

- `android/`: Android Studio/Gradle 프로젝트
- `capacitor.config.json`: 앱 ID, 표시 이름, 앱 자산 위치
- `mobile/entry.js`: 네이티브 기능 연결과 앱 초기화
- `mobile/client.mjs`: 오프라인 추천 및 서버 통신 분리
- `mobile/config.json`: 공개 서버 주소만 저장
- `scripts/build-mobile.mjs`: 허용된 UI 파일만 앱 번들로 생성
- `scripts/build-android.mjs`: 빌드 도구 확인 → Gradle → APK 복사
- `dist-mobile/`: 생성된 앱 UI 파일, Git 제외

앱 파일 미리보기는 `npm run build:mobile` 후 `npm run preview:mobile`로 확인할 수 있습니다. 이 미리보기는 네이티브 기기 검증을 대신하지 않습니다.



