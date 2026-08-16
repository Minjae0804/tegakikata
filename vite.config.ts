import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // https://github.com/Minjae0804/tegakikata 를 GitHub Pages 프로젝트 페이지로 배포하므로
  // https://minjae0804.github.io/tegakikata/ 아래에서 서빙된다. base를 안 맞추면 빌드 결과의
  // /assets/... 절대경로가 도메인 루트를 가리켜서 전부 404가 난다.
  base: '/tegakikata/',
  plugins: [
    react(),
    tailwindcss(),
    // 모바일에서 "홈 화면에 추가"로 앱처럼 설치할 수 있게 하는 PWA 설정.
    // 실제 데이터(단어장/진도/AI 채점)는 항상 네트워크(구글 드라이브·AI API)가 필요하지만,
    // 앱 셸(정적 리소스: JS/CSS/폰트/kanjicanvas 필기 인식 스크립트/아이콘)은 서비스 워커가
    // 캐싱해서 오프라인이거나 네트워크가 느려도 앱 자체는 바로 뜬다.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: '테가키카타 · Tegakikata',
        short_name: '테가키카타',
        description: '손으로 써보며 익히는 일본어 한자 학습 앱',
        lang: 'ko',
        start_url: '/tegakikata/',
        scope: '/tegakikata/',
        display: 'standalone',
        background_color: '#f2efe3',
        theme_color: '#f2efe3',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // public/vendor/kanjicanvas 스크립트, 폰트, 아이콘까지 전부 앱 셸로 미리 캐싱한다.
        // kanjicanvas의 ref-patterns.js(획순 패턴 데이터)와 커스텀 폰트가 기본 2MB 상한을
        // 넘기 때문에 넉넉하게 올려둔다.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
})
