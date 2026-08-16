import { useEffect, useId, useRef, useState } from 'react';
import {
  initRecognizer,
  clearCanvas,
  undoLastStroke,
  recognize,
} from '../../lib/kanjicanvas/handwritingRecognizer';
import { Button } from '../common/Button';

interface HandwritingFrameProps {
  size?: number;
  hint?: string;
  crosshair?: boolean;
  /** 인식 버튼을 눌렀을 때 후보 리스트를 전달한다. */
  onRecognize?: (candidates: string[]) => void;
  /** 지우기 버튼을 눌렀을 때 호출된다 (부모가 들고 있는 이전 후보 목록을 같이 지우도록). */
  onClear?: () => void;
}

/**
 * 시그니처 컴포넌트: 한자 연습장의 田字格(십자 보조선)을 그대로 옮긴 필기 입력 프레임.
 * 내부에 실제 kanjicanvas canvas를 마운트하고, 지우기/한 획 취소/인식 컨트롤을 함께 제공한다.
 */
export function HandwritingFrame({
  size = 220,
  hint = '여기에 획을 그어보세요',
  crosshair = true,
  onRecognize,
  onClear,
}: HandwritingFrameProps) {
  const reactId = useId();
  const canvasId = `handwriting-canvas-${reactId.replace(/:/g, '')}`;
  const initialized = useRef(false);
  const [hasStrokes, setHasStrokes] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initRecognizer(canvasId);
    initialized.current = true;

    // kanjicanvas가 canvas에 직접 붙이는 포인터 이벤트를 감지해 힌트 표시 여부만 갱신한다.
    const canvasEl = document.getElementById(canvasId);
    const markDrawn = () => setHasStrokes(true);
    canvasEl?.addEventListener('pointerdown', markDrawn);
    return () => canvasEl?.removeEventListener('pointerdown', markDrawn);
  }, [canvasId]);

  const handleClear = () => {
    clearCanvas(canvasId);
    setHasStrokes(false);
    onClear?.();
  };

  const handleUndo = () => {
    undoLastStroke(canvasId);
  };

  const handleRecognize = () => {
    const { candidates } = recognize(canvasId);
    onRecognize?.(candidates);
  };

  return (
    <div className="inline-flex items-center gap-3">
      {/* 이 컨트롤들(한 획 취소/지우기/인식하기)을 입력창 아래가 아니라 왼쪽에 세로로 둔다 —
          아래에 두면 화면 하단의 제출 버튼과 바로 붙어서 오작동하기 쉬웠다. */}
      <div className="flex flex-col gap-2">
        {/* 한 획 취소가 지우기보다 훨씬 자주 쓰는 동작이라, 지우기(전체 삭제)보다 더 강조한다. */}
        <Button variant="outline" size="sm" onClick={handleUndo}>
          한 획 취소
        </Button>
        <Button variant="ghost" size="sm" onClick={handleClear}>
          지우기
        </Button>
        <Button variant="primary" size="sm" onClick={handleRecognize}>
          인식하기
        </Button>
      </div>
      <div
        className={`genko-frame relative rounded-[var(--radius-box)] ${
          crosshair ? 'genko-frame-cross' : ''
        }`}
        style={{ width: size, height: size }}
      >
        <canvas
          id={canvasId}
          width={size}
          height={size}
          className="relative z-10 touch-none"
        />
        {!hasStrokes && (
          <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="font-body text-xs text-base-content/30 select-none">{hint}</span>
          </span>
        )}
      </div>
    </div>
  );
}
