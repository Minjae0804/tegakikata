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
  default: { card: 'w-40 gap-2 p-4', main: 'text-4xl', reading: 'text-sm', meaning: 'text-xs' },
  lg: { card: 'w-56 gap-3 p-6', main: 'text-6xl', reading: 'text-lg', meaning: 'text-base' },
} as const;

/** 단어장의 단어 한 장. 원고지 칸 느낌의 얇은 테두리 카드. */
export function WordCard({ word, crosshair = true, size = 'default', label }: WordCardProps) {
  // 한자 표기가 없는 단어(たくさん 등)는 큰 글자 자리에 대신 읽기를 넣고, 아래 읽기 줄은 생략한다
  // (안 그러면 큰 칸이 비어보이고 바로 밑에 같은 내용이 작게 또 나온다).
  const wordHasKanji = hasKanji(word);
  const s = SIZE_CLASSES[size];
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
      <span className={`font-jp ${s.main} font-semibold text-base-content`}>
        {wordHasKanji ? word.kanji : word.reading}
      </span>
      {wordHasKanji && <span className={`font-jp ${s.reading} text-base-content/80`}>{word.reading}</span>}
      <span className={`font-body ${s.meaning} text-base-content/70`}>{word.meaning}</span>
    </div>
  );
}
