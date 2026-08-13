import type { WordEntry } from '../../types';

interface JlptBadgeProps {
  level: NonNullable<WordEntry['jlptLevel']>;
}

/**
 * 하양(印) 스탬프를 본뜬 JLPT 레벨 표시.
 * 실제 한자 학습서에서 급수를 도장처럼 찍어 표기하는 관습을 참고.
 */
export function JlptBadge({ level }: JlptBadgeProps) {
  return (
    <span
      className="font-display inline-flex h-7 w-7 shrink-0 -rotate-3 items-center justify-center
                 border-2 border-secondary text-[11px] font-semibold text-secondary"
      aria-label={`JLPT ${level}`}
    >
      {level}
    </span>
  );
}
