import type { WordEntry } from '../../types';
import { hasKanji } from '../../lib/wordbank/hasKanji';
import { JlptBadge } from './JlptBadge';

interface WordCardProps {
  word: WordEntry;
  crosshair?: boolean;
}

/** 단어장의 단어 한 장. 원고지 칸 느낌의 얇은 테두리 카드. */
export function WordCard({ word, crosshair = true }: WordCardProps) {
  // 한자 표기가 없는 단어(たくさん 등)는 큰 글자 자리에 대신 읽기를 넣고, 아래 읽기 줄은 생략한다
  // (안 그러면 큰 칸이 비어보이고 바로 밑에 같은 내용이 작게 또 나온다).
  const wordHasKanji = hasKanji(word);
  return (
    <div
      className={`genko-frame flex w-40 flex-col items-center gap-2 rounded-[var(--radius-box)] p-4 ${
        crosshair ? 'genko-frame-cross' : ''
      }`}
    >
      <div className="flex w-full justify-end">
        {word.jlptLevel && <JlptBadge level={word.jlptLevel} />}
      </div>
      <span className="font-jp text-4xl text-base-content">{wordHasKanji ? word.kanji : word.reading}</span>
      {wordHasKanji && <span className="font-jp text-sm text-base-content/70">{word.reading}</span>}
      <span className="font-body text-xs text-base-content/50">{word.meaning}</span>
    </div>
  );
}
