import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // https://github.com/Minjae0804/tegakikata 를 GitHub Pages 프로젝트 페이지로 배포하므로
  // https://minjae0804.github.io/tegakikata/ 아래에서 서빙된다. base를 안 맞추면 빌드 결과의
  // /assets/... 절대경로가 도메인 루트를 가리켜서 전부 404가 난다.
  base: '/tegakikata/',
  plugins: [react(), tailwindcss()],
})
