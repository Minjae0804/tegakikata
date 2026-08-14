// 히라가나 입력 팔레트. kanjicanvas는 필기로 히라가나를 인식하지 못하므로 버튼으로 입력한다.
// 휴대폰 일본어 자판(플릭/틸트 입력)을 참고한 배치: 자음별 키 하나를 3열 그리드로 두고,
// 누르면 그 행의 모음(あ・い・う・え・お)이 아래에 펼쳐져서 그중 하나를 고르는 방식.
//
// 탁음(゛)/반탁음(゜)은 "대기 상태" 방식으로 처리한다: 버튼을 누르면 대기 상태가 켜지고,
// 그다음에 고르는 글자 하나에 자동으로 적용된 뒤 대기 상태가 꺼진다 (휴대폰 자판과 동일한 방식).
import { useState } from 'react';
import { applyDakuten } from '../../../lib/kana/dakuten';

interface HiraganaKeyboardProps {
  onSelect: (char: string) => void;
}

interface ColumnDef {
  label: string; // 키에 표시되는 대표 글자 (あ단)
  vowels: string[]; // [あ, い, う, え, お] 순서, 없는 칸은 ''
}

// 휴대폰 자판과 동일한 3열 배치 순서 (あ카か사さ / た나な하は / ま야や라ら / わ단)
const COLUMNS: ColumnDef[] = [
  { label: 'あ', vowels: ['あ', 'い', 'う', 'え', 'お'] },
  { label: 'か', vowels: ['か', 'き', 'く', 'け', 'こ'] },
  { label: 'さ', vowels: ['さ', 'し', 'す', 'せ', 'そ'] },
  { label: 'た', vowels: ['た', 'ち', 'つ', 'て', 'と'] },
  { label: 'な', vowels: ['な', 'に', 'ぬ', 'ね', 'の'] },
  { label: 'は', vowels: ['は', 'ひ', 'ふ', 'へ', 'ほ'] },
  { label: 'ま', vowels: ['ま', 'み', 'む', 'め', 'も'] },
  { label: 'や', vowels: ['や', '', 'ゆ', '', 'よ'] },
  { label: 'ら', vowels: ['ら', 'り', 'る', 'れ', 'ろ'] },
  { label: 'わ', vowels: ['わ', '', 'を', '', 'ん'] },
];

const YOUON_ROW: string[] = ['ゃ', 'ゅ', 'ょ', 'っ'];

const VOWEL_LABELS = ['あ', 'い', 'う', 'え', 'お'];

/** 클릭해서 히라가나를 직접 입력하는 버튼 팔레트 — 휴대폰 자판(플릭 입력) 배치를 참고. */
export function HiraganaKeyboard({ onSelect }: HiraganaKeyboardProps) {
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

      {/* 요음/촉음 */}
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
      </div>
    </div>
  );
}
