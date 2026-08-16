import type { WordEntry } from '../../types';
import { hasKanji } from '../../lib/wordbank/hasKanji';
import { JlptBadge } from './JlptBadge';

interface WordCardProps {
  word: WordEntry;
  crosshair?: boolean;
  /** 'lg'는 정답 공개처럼 크고 또렷하게 보여줘야 할 때 쓴다 (게임 피드백 등). */
  size?: 'default' | 'lg';
  /** 왼쪽 위에 JLPT 배지와 대칭으로 찍는 도장 라벨 — 예: "정답". */
  label?: string;
}

const SIZE_CLASSES = {
  // lg는 정답 공개용 — 위에 있는 문제/프롬프트 박스와 가로폭을 맞추려고 고정폭이 아니라 w-full.
  default: { card: 'w-40 gap-2 p-4', main: 'text-4xl', reading: 'text-sm', meaning: 'text-xs' },
  lg: { card: 'w-full gap-3 p-6', main: 'text-6xl', reading: 'text-lg', meaning: 'text-base' },
} as const;

// 글자 수가 많아지면 한 줄 안에 안 들어가고 줄바꿈되므로, 길이에 따라 폰트 크기를 단계적으로
// 줄인다 — 축소하더라도 절대 두 줄로 넘어가지 않게(whitespace-nowrap과 함께 쓴다).
const MAIN_SIZE_STEPS: { default: string[]; lg: string[] } = {
  default: ['text-4xl', 'text-3xl', 'text-2xl', 'text-xl'],
  lg: ['text-6xl', 'text-5xl', 'text-4xl', 'text-3xl', 'text-2xl'],
};

function mainTextSizeClass(text: string, size: 'default' | 'lg'): string {
  const steps = MAIN_SIZE_STEPS[size];
  // 대략 글자 2개당 한 단계씩 줄인다 — 정확한 픽셀 측정 없이도 대부분의 길이에서 한 줄을 유지한다.
  const stepIndex = Math.min(steps.length - 1, Math.floor(text.length / 2));
  return steps[stepIndex];
}

/** 단어장의 단어 한 장. 원고지 칸 느낌의 얇은 테두리 카드. */
export function WordCard({ word, crosshair = true, size = 'default', label }: WordCardProps) {
  // 한자 표기가 없는 단어(たくさん 등)는 큰 글자 자리에 대신 읽기를 넣고, 아래 읽기 줄은 생략한다
  // (안 그러면 큰 칸이 비어보이고 바로 밑에 같은 내용이 작게 또 나온다).
  const wordHasKanji = hasKanji(word);
  const s = SIZE_CLASSES[size];
  const mainText = wordHasKanji ? word.kanji : word.reading;
  return (
    <div
      className={`genko-frame flex flex-col items-center rounded-[var(--radius-box)] ${s.card} ${
        crosshair ? 'genko-frame-cross' : ''
      }`}
    >
      <div className="flex w-full items-center justify-between">
        {label ? (
          <span
            className="font-display inline-flex h-7 shrink-0 rotate-3 items-center justify-center
                       border-2 border-primary px-1.5 text-[11px] font-semibold text-primary"
          >
            {label}
          </span>
        ) : (
          <span />
        )}
        {word.jlptLevel && <JlptBadge level={word.jlptLevel} />}
      </div>
      <span className={`font-jp ${mainTextSizeClass(mainText, size)} whitespace-nowrap font-semibold text-base-content`}>
        {mainText}
      </span>
      {wordHasKanji && <span className={`font-jp ${s.reading} text-base-content/80`}>{word.reading}</span>}
      <span className={`font-body ${s.meaning} text-base-content/70`}>{word.meaning}</span>
    </div>
  );
}
