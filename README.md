# 테가키카타 (Tegakikata)

일본어 한자 필기 인식 기반 학습 게임 웹앱. 백엔드 서버 없이 Google Drive + Gemini/Claude API를 클라이언트에서 직접 연동해 동작한다.

## 아키텍처

- **프론트엔드만 존재** — React + TypeScript, 정적 사이트로 GitHub Pages 배포
- **데이터 저장소**: 사용자 개인 Google Drive (앱 전용 폴더에 config/profile/instructions/grammar/wordbanks/saves 분리 저장)
- **AI**: Gemini 또는 Claude API를 브라우저에서 직접 호출 (키는 온보딩에서 입력해 Drive의 config.json에 저장, BYOK)
- **필기 인식**: kanjicanvas (클라이언트 전용)
- **캐시**: 앱 로딩 시 Drive에서 읽어와 localStorage에 캐싱

## 게임 모드

- **빈칸 채우기** (埋) — AI가 만든 예문의 빈칸을 필기로 채운다
- **문장 번역** (訳) — 한국어 문장을 일본어로 옮기면 AI가 채점한다
- **단어장 맞추기** (単) — 내가 고른 단어장으로만 연습. 한자 쓰기는 AI 없이, 읽기·뜻 맞히기는 AI가 채점한다
- **단어장 학습** (習) — 플래시카드로 훑어보며 "안다/모른다"만 표시하면, 간격 반복(SRS)으로 복습 시점을 알아서 조절한다

## 문서

- [사용법](docs/GUIDE.md) — 게임 모드별 조작법, 단어장 CSV 형식, 문법 노트, FAQ
- [AI API 키 발급](docs/API_KEYS.md) — Gemini/Claude 키 신청 방법, 모델 선택, 현재 권장 프로바이더
- [AI로 단어장 만들기](docs/WORDBANK_AI_PROMPT.md) — 교재 사진/파일을 AI에 올려 CSV 단어장을 생성하는 프롬프트
- [개발 & 배포 설정](docs/SETUP.md) — 로컬 실행, Google Cloud 설정, GitHub Pages 배포

## 폴더 구조

```
src/
  components/
    game/fill-blank/     # 빈칸 채우기 게임 UI
    handwriting/         # kanjicanvas 캔버스 컴포넌트
    onboarding/          # 최초 로그인 온보딩 UI
    wordbank/            # 단어장 선택/업로드 피커
    common/
  lib/
    drive/                # Google Drive API 레이어
    gemini/, claude/, ai/ # AI 프로바이더 레이어 (ai/aiClient.ts가 공용 파사드)
    kanjicanvas/          # 필기 인식 래퍼
    srs/                  # 단어장 학습(플래시카드) 간격 반복 스케줄러
    storage/              # localStorage 캐시 레이어
    wordbank/             # CSV 파싱/셔플
  hooks/
  pages/
  types/
```

## 개발

```bash
npm install
npm run dev       # 개발 서버
npm run lint      # oxlint
npm run build     # 타입체크 + 빌드
```

로컬 실행에 필요한 `.env` 설정과 GitHub Pages 배포 절차는 [docs/SETUP.md](docs/SETUP.md)에 정리돼 있다.

## 배포

`main` 브랜치 푸시 시 GitHub Actions가 자동으로 빌드 후 GitHub Pages에 배포한다. 셀프호스팅(포크해서 자기 도메인에 배포) 절차는 [docs/SETUP.md](docs/SETUP.md) 참고.
