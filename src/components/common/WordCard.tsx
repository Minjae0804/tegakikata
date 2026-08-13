import type { WordEntry } from '../../types';
import { JlptBadge } from './JlptBadge';

interface WordCardProps {
  word: WordEntry;
  crosshair?: boolean;   // ← 이 줄
}


/** 단어장의 단어 한 장. 원고지 칸 느낌의 얇은 테두리 카드. */
export function WordCard({ word, crosshair = true }: WordCardProps) {
  return (
    <div className="genko-frame flex w-40 flex-col items-center gap-2 rounded-[var(--radius-box)] p-4">
      <div className="flex w-full justify-end">
        {word.jlptLevel && <JlptBadge level={word.jlptLevel} />}
      </div>
      <span className="font-jp text-4xl text-base-content">{word.kanji}</span>
      <span className="font-jp text-sm text-base-content/70">{word.reading}</span>
      <span className="font-body text-xs text-base-content/50">{word.meaning}</span>
    </div>
  );
}
