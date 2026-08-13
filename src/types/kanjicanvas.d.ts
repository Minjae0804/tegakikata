/**
 * public/vendor/kanjicanvas/kanji-canvas.min.js + ref-patterns.js를
 * index.html에서 <script> 태그로 로드해 만들어지는 전역 객체 타입.
 * npm 패키지가 아니라 순수 클라이언트 스크립트라 전역으로만 존재한다.
 * (원본: https://github.com/asdfjkl/kanjicanvas)
 */
interface KanjiCanvasStatic {
  refPatterns: unknown[];
  /** canvas id를 받아 해당 canvas를 필기 입력용으로 초기화한다. */
  init(canvasId: string): void;
  /** 해당 canvas의 모든 획을 지운다. */
  erase(canvasId: string): void;
  /** 해당 canvas의 가장 최근 획 하나만 지운다. */
  deleteLast(canvasId: string): void;
  /**
   * 그려진 획을 분석해 후보 문자를 반환한다.
   * canvas에 data-candidate-list가 지정돼 있으면 그 엘리먼트에 직접 렌더링하고 undefined를 반환하며,
   * 지정돼 있지 않으면 후보를 콤마로 이어붙인 문자열을 반환한다.
   */
  recognize(canvasId: string): string | undefined;
}

interface Window {
  KanjiCanvas: KanjiCanvasStatic;
}
