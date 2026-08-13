interface FeedbackBannerProps {
  status: 'correct' | 'incorrect';
  message: string;
}

/**
 * 채점 결과 배너. 일본 학습지의 첨삭 관습을 색상 의미로 차용:
 * 정답 = 먹/남색 동그라미(◯), 오답 = 붉은 사선(✗) 첨삭.
 */
export function FeedbackBanner({ status, message }: FeedbackBannerProps) {
  const isCorrect = status === 'correct';
  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-[var(--radius-box)] border-2 px-4 py-3 ${
        isCorrect ? 'border-primary bg-primary/5' : 'border-secondary bg-secondary/5'
      }`}
    >
      <span
        className={`font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-lg ${
          isCorrect ? 'border-primary text-primary' : 'border-secondary text-secondary'
        }`}
      >
        {isCorrect ? '◯' : '✗'}
      </span>
      <p className="font-body text-sm text-base-content">{message}</p>
    </div>
  );
}
