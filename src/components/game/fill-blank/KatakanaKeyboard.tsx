// 가타카나 입력 팔레트. HiraganaKeyboard와 완전히 같은 방식(휴대폰 자판 플릭 입력)이고,
// 문자 집합만 가타카나로 바꿨다 — 외래어 등 가타카나로 표기되는 단어를 입력할 때 쓴다.
//
// 탁음(゛)/반탁음(゜)은 "대기 상태" 방식으로 처리한다: 버튼을 누르면 대기 상태가 켜지고,
// 그다음에 고르는 글자 하나에 자동으로 적용된 뒤 대기 상태가 꺼진다 (휴대폰 자판과 동일한 방식).
import { useState } from 'react';
import { applyDakuten } from '../../../lib/kana/dakuten';

interface KatakanaKeyboardProps {
  onSelect: (char: string) => void;
}

interface ColumnDef {
  label: string; // 키에 표시되는 대표 글자 (ア단)
  vowels: string[]; // [ア, イ, ウ, エ, オ] 순서, 없는 칸은 ''
}

// 휴대폰 자판과 동일한 3열 배치 순서 (ア카カ사サ / タ나ナ하ハ / マ야ヤ라ラ / ワ단)
const COLUMNS: ColumnDef[] = [
  { label: 'ア', vowels: ['ア', 'イ', 'ウ', 'エ', 'オ'] },
  { label: 'カ', vowels: ['カ', 'キ', 'ク', 'ケ', 'コ'] },
  { label: 'サ', vowels: ['サ', 'シ', 'ス', 'セ', 'ソ'] },
  { label: 'タ', vowels: ['タ', 'チ', 'ツ', 'テ', 'ト'] },
  { label: 'ナ', vowels: ['ナ', 'ニ', 'ヌ', 'ネ', 'ノ'] },
  { label: 'ハ', vowels: ['ハ', 'ヒ', 'フ', 'ヘ', 'ホ'] },
  { label: 'マ', vowels: ['マ', 'ミ', 'ム', 'メ', 'モ'] },
  { label: 'ヤ', vowels: ['ヤ', '', 'ユ', '', 'ヨ'] },
  { label: 'ラ', vowels: ['ラ', 'リ', 'ル', 'レ', 'ロ'] },
  { label: 'ワ', vowels: ['ワ', '', 'ヲ', '', 'ン'] },
];

const YOUON_ROW: string[] = ['ャ', 'ュ', 'ョ', 'ッ'];

const VOWEL_LABELS = ['ア', 'イ', 'ウ', 'エ', 'オ'];

/** 클릭해서 가타카나를 직접 입력하는 버튼 팔레트 — HiraganaKeyboard와 동일한 배치. */
export function KatakanaKeyboard({ onSelect }: KatakanaKeyboardProps) {
  const [activeColumn, setActiveColumn] = useState<number | null>(null);
  const [pendingModifier, setPendingModifier] = useState<'dakuten' | 'handakuten' | null>(null);

  const handleKeyClick = (index: number) => {
    setActiveColumn((prev) => (prev === index ? null : index));
  };

  /** 대기 중인 탁음/반탁음이 있으면 적용한 뒤 선택을 확정한다. */
  const commitSelect = (char: string) => {
    if (!char) return;
    const finalChar = pendingModifier ? applyDakuten(char, pendingModifier) : char;
    onSelect(finalChar);
    setPendingModifier(null);
    setActiveColumn(null);
  };

  const toggleModifier = (type: 'dakuten' | 'handakuten') => {
    setPendingModifier((prev) => (prev === type ? null : type));
  };

  // 플릭 미리보기용 모음 배열 — activeColumn이 없을 때도 항상 5칸을 유지해서
  // (아래 border-transparent)와 같은 원리로) 오른쪽 열의 자리를 고정해둔다.
  const activeVowels = activeColumn !== null ? COLUMNS[activeColumn].vowels : ['', '', '', '', ''];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        {/* 휴대폰 자판 스타일 3열 그리드 */}
        <div className="grid grid-cols-3 gap-1.5">
          {COLUMNS.map((col, i) => (
            <button
              key={col.label}
              type="button"
              onClick={() => handleKeyClick(i)}
              className={`font-jp flex h-11 w-11 items-center justify-center rounded-[var(--radius-field)]
                border-2 text-lg transition-colors
                ${activeColumn === i ? 'border-primary bg-primary/10 text-primary' : 'border-base-300 bg-base-100 hover:border-primary'}
              `}
            >
              {col.label}
            </button>
          ))}
        </div>

        {/* 플릭 미리보기: 선택된 자음 키의 모음 5개가 그리드 오른쪽에 세로로 펼쳐짐.
            activeColumn이 없어도 5칸(자리)은 항상 렌더링해서, 키를 고를 때마다
            레이아웃 전체가 밀렸다 당겨졌다 하는 흔들림을 막는다. */}
        <div
          className={`flex flex-col gap-1.5 rounded-[var(--radius-box)] border p-1.5 transition-colors
            ${activeColumn !== null ? 'border-base-300 bg-base-200/50' : 'border-transparent'}
          `}
        >
          {activeVowels.map((char, vi) => (
            <button
              key={vi}
              type="button"
              disabled={!char}
              onClick={() => commitSelect(char)}
              className={`font-jp flex h-9 w-9 items-center justify-center rounded-[var(--radius-field)] text-base
                ${char ? 'border-2 border-accent bg-accent/10 hover:bg-accent/20' : 'opacity-0'}
              `}
            >
              {char || VOWEL_LABELS[vi]}
            </button>
          ))}
        </div>
      </div>

      {/* 탁음/반탁음 대기 버튼 — 누르면 켜지고, 그다음 고르는 글자 하나에 적용된 뒤 꺼진다 */}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => toggleModifier('dakuten')}
            className={`font-jp flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-field)]
              border-2 px-3 text-sm transition-colors
              ${pendingModifier === 'dakuten' ? 'border-primary bg-primary/10 text-primary' : 'border-base-300 bg-base-100 hover:border-primary'}
            `}
          >
            <span className="text-lg">゛</span>
            <span className="font-body text-xs text-base-content/60">탁음</span>
          </button>
          <button
            type="button"
            onClick={() => toggleModifier('handakuten')}
            className={`font-jp flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-field)]
              border-2 px-3 text-sm transition-colors
              ${pendingModifier === 'handakuten' ? 'border-primary bg-primary/10 text-primary' : 'border-base-300 bg-base-100 hover:border-primary'}
            `}
          >
            <span className="text-lg">゜</span>
            <span className="font-body text-xs text-base-content/60">반탁음</span>
          </button>
        </div>
        {pendingModifier && (
          <span className="font-body text-xs text-primary">
            {pendingModifier === 'dakuten' ? '탁음' : '반탁음'} 대기 중 — 다음에 고르는 글자에 적용돼요
          </span>
        )}
      </div>

      {/* 요음/촉음 + 띄어쓰기 */}
      <div className="flex gap-1.5">
        {YOUON_ROW.map((char) => (
          <button
            key={char}
            type="button"
            onClick={() => commitSelect(char)}
            className="font-jp flex h-8 w-8 items-center justify-center rounded-[var(--radius-field)]
                       border-2 border-base-300 bg-base-100 text-sm transition-colors hover:border-primary"
          >
            {char}
          </button>
        ))}
        <button
          type="button"
          onClick={() => commitSelect(' ')}
          className="font-body flex h-8 items-center justify-center rounded-[var(--radius-field)]
                     border-2 border-base-300 bg-base-100 px-3 text-xs text-base-content/60
                     transition-colors hover:border-primary"
        >
          띄어쓰기
        </button>
      </div>
    </div>
  );
}
