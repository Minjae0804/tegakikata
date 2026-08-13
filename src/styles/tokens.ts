/**
 * 테가키카타 디자인 토큰 목록
 * ─────────────────────────
 * src/index.css의 @plugin "daisyui/theme" 블록과 값이 반드시 일치해야 한다.
 * CSS는 :root/daisyUI 변수로, 이 파일은 JS/TS 코드(차트, 인라인 스타일, 동적 계산 등)에서
 * 같은 값을 쓰고 싶을 때 참조하는 단일 소스다. 값을 바꿀 땐 이 파일과 index.css를 함께 수정한다.
 */

export const colors = {
  base100: '#f2efe3', // washi 종이 바탕
  base200: '#e6e2d0',
  base300: '#d5d0b8', // 원고지 격자선
  baseContent: '#1d1c18', // 먹(sumi) 잉크 텍스트

  primary: '#2f5288', // 남색 藍色 — 정답/포커스
  primaryContent: '#f2efe3',

  secondary: '#b83b2c', // 주색 朱色 — 오답/교정 표시
  secondaryContent: '#f2efe3',

  accent: '#a9843f', // 도장/스탬프 강조
  accentContent: '#1d1c18',

  neutral: '#1d1c18',
  neutralContent: '#f2efe3',

  success: '#4b6c4b',
  successContent: '#f2efe3',
  warning: '#a9843f',
  warningContent: '#1d1c18',
  error: '#b83b2c',
  errorContent: '#f2efe3',
} as const;

export const fonts = {
  // 로컬 폰트 (/public/fonts/) — 외부 CDN 의존성 없음
  display: '"Elice Digital Baeum", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Malgun Gothic", sans-serif',
  body: '"Elice Digital Baeum", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Malgun Gothic", sans-serif',
  data: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  // 실제 일본어 단어(한자/읽기) 표시 전용
  japanese: '"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif JP", serif',
} as const;

export const radius = {
  selector: '0.25rem',
  field: '0.25rem',
  box: '0.5rem',
} as const;

export const border = {
  width: '1.5px',
} as const;

export type ColorToken = keyof typeof colors;
export type FontToken = keyof typeof fonts;
