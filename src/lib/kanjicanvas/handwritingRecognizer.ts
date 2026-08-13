// kanjicanvas(window.KanjiCanvas) 래퍼 — canvas 스트로크 입력을 받아 한자 후보 리스트 반환
// 실제 라이브러리는 index.html에서 <script>로 전역 로드된다 (src/types/kanjicanvas.d.ts 참고).

export interface RecognitionResult {
  candidates: string[];
}

function getKanjiCanvas() {
  if (typeof window === 'undefined' || !window.KanjiCanvas) {
    throw new Error(
      'KanjiCanvas가 로드되지 않았습니다. index.html의 vendor 스크립트 태그를 확인하세요.'
    );
  }
  return window.KanjiCanvas;
}

/** canvas id를 받아 필기 입력이 가능하도록 초기화한다. */
export function initRecognizer(canvasId: string): void {
  getKanjiCanvas().init(canvasId);
}

/** 가장 최근에 그린 획 하나만 지운다. */
export function undoLastStroke(canvasId: string): void {
  getKanjiCanvas().deleteLast(canvasId);
}

/** canvas의 모든 획을 지운다. */
export function clearCanvas(canvasId: string): void {
  getKanjiCanvas().erase(canvasId);
}

/**
 * 그려진 획을 분석해 후보 문자 리스트를 반환한다.
 * data-candidate-list를 쓰지 않고 항상 문자열로 직접 받아 우리 쪽 상태로 관리한다.
 */
export function recognize(canvasId: string): RecognitionResult {
  const raw = getKanjiCanvas().recognize(canvasId);
  const candidates = (raw ?? '')
    .split(/\s+/)
    .map((c) => c.trim())
    .filter(Boolean);
  return { candidates };
}
