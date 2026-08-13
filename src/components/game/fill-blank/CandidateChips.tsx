interface CandidateChipsProps {
  candidates: string[];
  correctAnswer?: string;
  selected?: string;
  onSelect?: (candidate: string) => void;
}

/** kanjicanvas가 반환한 후보 한자를 입력기처럼 나열해 사용자가 고르게 한다. */
export function CandidateChips({ candidates, correctAnswer, selected, onSelect }: CandidateChipsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="listbox" aria-label="한자 후보">
      {candidates.map((candidate) => {
        const isSelected = selected === candidate;
        const isRevealed = Boolean(correctAnswer) && isSelected;
        const isRight = isRevealed && candidate === correctAnswer;
        const isWrong = isRevealed && candidate !== correctAnswer;

        return (
          <button
            key={candidate}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect?.(candidate)}
            className={`font-jp flex h-12 w-12 items-center justify-center rounded-[var(--radius-field)]
              border-2 text-xl transition-colors
              ${isRight ? 'border-primary bg-primary/10 text-primary' : ''}
              ${isWrong ? 'border-secondary bg-secondary/10 text-secondary' : ''}
              ${!isRevealed && isSelected ? 'border-accent bg-accent/10' : ''}
              ${!isRevealed && !isSelected ? 'border-base-300 bg-base-100 hover:border-primary' : ''}
            `}
          >
            {candidate}
          </button>
        );
      })}
    </div>
  );
}
