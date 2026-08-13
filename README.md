# 테가키카타 (Tegakikata)

일본어 한자 필기 인식 기반 학습 게임 웹앱. 백엔드 서버 없이 Google Drive + Gemini API를 클라이언트에서 직접 연동해 동작합니다.

## 아키텍처
- **프론트엔드만 존재** — React + TypeScript, 정적 사이트로 GitHub Pages 배포
- **데이터 저장소**: 사용자 개인 Google Drive (앱 전용 폴더에 config/profile/memory/instructions/context/wordbanks/saves 분리 저장)
- **AI**: Gemini API를 브라우저에서 직접 호출 (API 키는 Drive의 config.json에서 로드)
- **필기 인식**: kanjicanvas (클라이언트 전용)
- **캐시**: 앱 로딩 시 Drive에서 읽어와 localStorage에 캐싱

## 폴더 구조
```
src/
  components/
    game/fill-blank/   # 빈칸 채우기 게임 UI
    game/translate/    # 번역 게임 UI
    handwriting/        # kanjicanvas 캔버스 컴포넌트
    onboarding/          # 최초 로그인 온보딩 UI
    common/
  lib/
    drive/               # Google Drive API 레이어
    gemini/              # Gemini API 레이어
    kanjicanvas/         # 필기 인식 래퍼
    storage/             # localStorage 캐시 레이어
  hooks/
  pages/
  types/
  data/
```

## 개발
```bash
npm install
npm run dev       # 개발 서버
npm run lint      # oxlint
npm run build     # 타입체크 + 빌드
```

## 배포
`main` 브랜치 푸시 시 GitHub Actions가 자동으로 빌드 후 GitHub Pages에 배포합니다.

## 셀프호스팅 안내 (예정)
Google Drive OAuth 클라이언트 ID 발급 및 등록 방법은 추후 문서화 예정입니다.
