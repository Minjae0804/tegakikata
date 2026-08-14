// 한자(필기)/히라가나/가타카나 입력을 토글 탭으로 전환하며 쓰는 공용 입력 패널.
// 예전엔 이 세 가지 입력 방식(필기 캔버스+후보, 히라가나 버튼, 가타카나 버튼)을 페이지마다
// 따로 조립해서 썼는데(빈칸 채우기/단어장 맞추기/번역/단어장 학습 4곳), 전부 토글 방식으로
// 통일하면서 이 컴포넌트 하나로 합쳤다.
//
// 모드(mode)는 부모가 들고 있는 controlled 값이다 — 부모 쪽에도 "지금 어떤 모드인지"가
// 필요한 경우가 많아서(예: 한자 모드일 땐 답 입력칸을 읽기 전용으로 바꾸는 등) 이렇게 뒀다.
// 필기 후보/캔버스 리셋 같은 세부 구현은 이 컴포넌트 안에 캡슐화돼 있다.
import { useState } from 'react';
import { HandwritingFrame } from '../../handwriting/HandwritingFrame';
import { CandidateChips } from './CandidateChips';
import { HiraganaKeyboard } from './HiraganaKeyboard';
import { KatakanaKeyboard } from './KatakanaKeyboard';

export type KanaInputMode = 'kanji' | 'hiragana' | 'katakana';

const MODE_LABELS: Record<KanaInputMode, string> = {
  kanji: '한자 입력',
  hiragana: '히라가나 입력',
  katakana: '가타카나 입력',
};

interface KanaInputPanelProps {
  mode: KanaInputMode;
  onModeChange: (mode: KanaInputMode) => void;
  onSelect: (char: string) => void;
  /** 어떤 탭을 보여줄지 — 기본은 셋 다. 예: 읽기(가나)만 받을 땐 ['hiragana', 'katakana']. */
  modes?: KanaInputMode[];
}

export function KanaInputPanel({ mode, onModeChange, onSelect, modes = ['kanji', 'hiragana', 'katakana'] }: KanaInputPanelProps) {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [canvasKey, setCanvasKey] = useState(0);

  const handleModeChange = (next: KanaInputMode) => {
    if (next === mode) return;
    setCandidates([]);
    onModeChange(next);
  };

  const handleCandidateSelect = (char: string) => {
    onSelect(char);
    setCandidates([]);
    setCanvasKey((k) => k + 1);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {modes.length > 1 && (
        <div className="flex gap-2">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              className={`btn btn-sm rounded-[var(--radius-field)] ${mode === m ? 'btn-primary' : 'btn-outline'}`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      )}

      {mode === 'kanji' && modes.includes('kanji') && (
        <div className="flex flex-col items-center gap-3">
          <HandwritingFrame key={canvasKey} onRecognize={setCandidates} onClear={() => setCandidates([])} />
          {candidates.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              <span className="font-body text-xs text-base-content/50">
                인식 후보 — 고르면 입력한 글자에 추가돼요
              </span>
              <CandidateChips candidates={candidates} onSelect={handleCandidateSelect} />
            </div>
          )}
        </div>
      )}

      {mode === 'hiragana' && <HiraganaKeyboard onSelect={onSelect} />}
      {mode === 'katakana' && <KatakanaKeyboard onSelect={onSelect} />}
    </div>
  );
}
