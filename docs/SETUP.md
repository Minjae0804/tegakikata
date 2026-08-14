# 테가키카타 — 배포 & 개발 설정 가이드

로컬에서 프로젝트를 받아 실행하고, GitHub Pages로 배포까지 마치는 전체 순서.

## 1. 프로젝트 준비

```bash
npm install
```

### 필요한 정적 리소스 (코드로 자동 생성되지 않음, 직접 배치)

| 경로 | 용도 |
|---|---|
| `public/fonts/EliceDigitalBaeum_Regular.ttf` | 본문/제목 폰트 (Regular) |
| `public/fonts/EliceDigitalBaeum_Bold.ttf` | 본문/제목 폰트 (Bold) |
| `public/vendor/kanjicanvas/kanji-canvas.min.js` | 필기 인식 라이브러리 본체 |
| `public/vendor/kanjicanvas/ref-patterns.js` | 필기 인식 참조 패턴 데이터 (약 6.7MB) |

## 2. Google Cloud Console 설정

이 앱은 백엔드 서버 없이 각 사용자의 구글 드라이브에 데이터를 저장한다. 그래서 **배포하는 사람이 자신의 Google Cloud 프로젝트에서 세 가지 값을 발급**받아야 한다.

### 2-1. 프로젝트 생성 및 API 활성화

1. [Google Cloud Console](https://console.cloud.google.com/) 에서 프로젝트 생성
2. **API 및 서비스 > 라이브러리**에서 아래 두 API를 각각 사용 설정
   - **Google Drive API** — 필수. 빠뜨리면 드라이브 관련 호출이 전부 403으로 막힌다.
   - **Google Picker API** — 사용자가 직접 만든 기존 CSV 파일을 워드뱅크로 선택할 때 필요 (없어도 앱 자체는 동작하지만, "내 드라이브에서 파일 선택" 기능만 못 씀)

### 2-2. OAuth 동의 화면

1. **API 및 서비스 > OAuth 동의 화면**에서 User Type "외부" 선택, 앱 정보 입력
2. **테스트 사용자**에 실제 로그인할 계정 등록 (게시 전 "테스트" 상태에서는 여기 등록된 계정만 로그인 가능 — 안 하면 `access_denied`)
3. ⚠️ 조직(Google Workspace) 계정으로 만들면, 조직 관리자가 외부 앱 연결이나 Gemini API 사용 자체를 정책으로 막아둔 경우가 있다. 막히면 개인 지메일 계정으로 시도해서 조직 정책 문제인지 구분할 것

### 2-3. 세 가지 값 발급

| 값 | 발급 위치 | 용도 |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | 사용자 인증 정보 > OAuth 클라이언트 ID (웹 애플리케이션) | 드라이브 로그인. **승인된 JavaScript 원본**에 배포 도메인을 정확히 등록해야 함 |
| `VITE_GOOGLE_API_KEY` | 사용자 인증 정보 > API 키 | Google Picker 구동용 |
| `VITE_GOOGLE_APP_ID` | Cloud Console 홈 화면의 "프로젝트 번호" (프로젝트 ID 아님, 숫자만) | Picker의 `setAppId`. **이게 없으면 Picker로 파일을 골라도 실제 접근 권한이 안 생겨서, 이후 파일을 읽으려 하면 404가 난다** — 가장 흔히 빠뜨리는 값 |

`.env.example`을 `.env`로 복사한 뒤 위 세 값을 채운다.

## 3. 개발 서버 실행

```bash
npm run dev
```

### 검증 명령

```bash
npx tsc -b        # 타입체크
npx oxlint src    # 린트
npm run build     # 빌드
```

## 4. AI API 키 (Gemini / Claude)

앱은 **온보딩 화면에서 사용자가 직접** Gemini 또는 Claude 중 하나를 고르고 API 키를 입력한다 (BYOK 방식, 배포자가 미리 넣어줄 필요 없음). 각자 발급 방법:

- **Gemini**: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)에서 발급. ⚠️ 2026년 8월 기준, 신규/휴면 상태의 "표준(제한 없는) 키"가 계정·결제 여부와 무관하게 `403 Your project has been denied access`로 막히는 구글 쪽 이슈가 보고되고 있다. 안 되면 AI Studio에서 새 키를 발급(자동으로 서비스 계정에 바인딩된 최신 포맷으로 생성됨)해서 재시도할 것.
- **Claude**: [platform.claude.com](https://platform.claude.com)(개발자 콘솔)에서 발급. `claude.ai` Pro/Max 구독과는 별개 계정/과금 체계다.

두 프로바이더 다 브라우저에서 직접 API를 호출하는 구조라, 서버 없이도 동작한다.

## 5. 배포 (GitHub Pages)

`main` 브랜치에 푸시하면 `.github/workflows/deploy.yml`이 자동으로 빌드 후 GitHub Pages에 배포한다.

### 5-1. 저장소 Secrets 등록 (필수)

GitHub Actions는 로컬 `.env` 파일을 못 보므로, 2-3에서 발급한 세 값을 **저장소 Secrets**로 등록해야 실제 배포 사이트에 반영된다.

**저장소 > Settings > Secrets and variables > Actions > New repository secret** 에서 아래 세 개를 각각 등록:
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_API_KEY`
- `VITE_GOOGLE_APP_ID`

### 5-2. 배포 도메인을 다시 승인된 원본에 추가

`http://localhost:5173`뿐 아니라, 실제 배포 도메인(예: `https://<username>.github.io`)도 2-3에서 만든 OAuth 클라이언트의 **승인된 JavaScript 원본**에 추가해야 배포된 사이트에서 드라이브 연동이 동작한다.

### 5-3. GitHub Pages 소스 설정

저장소 **Settings > Pages**에서 Source를 "GitHub Actions"로 지정.

## 6. 자주 겪는 문제

| 증상 | 원인 | 해결 |
|---|---|---|
| "Google Identity Services 스크립트를 불러오지 못했습니다" | 스크립트 로드 실패/지연 | 광고 차단기 확인. 코드가 최대 8초 폴링하니 그 이상이면 네트워크 문제 |
| Drive 검색/생성 시 403 | Drive API 미활성화 | 2-1의 Drive API 사용 설정 확인 |
| `origin_mismatch` (400) | 승인된 JavaScript 원본에 현재 접속 주소가 없음 | 정확한 프로토콜+호스트+포트로 등록 (localhost와 127.0.0.1은 다른 origin) |
| 로그인 시 `access_denied` | 테스트 사용자 미등록 | 2-2에서 로그인할 계정을 테스트 사용자로 추가 |
| Picker로 파일을 골랐는데 이후 읽기 시도가 404 | `setAppId` 누락 (`VITE_GOOGLE_APP_ID` 미설정) | 2-3 표 참고. drive.file 스코프에서는 필수 값 |
| CSV 단어장을 만들었는데 앱이 "파일을 찾을 수 없음" | drive.file 스코프는 앱이 만들지 않은 파일에 기본적으로 접근 불가 | 워드뱅크 화면의 "내 드라이브에서 파일 선택"(Picker)으로 골라야 접근 권한이 생김. 또는 앱 안의 "새 단어장 만들기"로 만들면 항상 접근 가능 |
| CSV는 있는데 단어가 하나도 안 불러와짐 | 엑셀/구글시트에서 내보낸 CSV에 BOM 문자가 붙어 헤더 인식 실패 | 최신 파서는 BOM을 자동 제거하므로 해결됨. 그래도 안 되면 헤더가 정확히 `kanji,reading,meaning`인지 확인 |
| CSV 파일명은 `.csv`인데 읽기 실패 | 실제로는 Google 스프레드시트인데 이름만 `.csv`인 경우 | 최신 코드는 mimeType을 확인해 구글 문서면 자동으로 내보내기(export) 방식으로 읽음 |
| Gemini 호출이 403 `denied access` | 구글 쪽 알려진 이슈 (4절 참고) | Claude로 전환하거나, 새 Cloud 프로젝트에서 키 재발급 |
| CSS(Tailwind/daisyUI)가 전혀 안 먹음 | `vite.config.ts`에 `tailwindcss()` 플러그인 누락 | `plugins: [react(), tailwindcss()]` 확인 |
