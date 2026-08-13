interface OnboardingStepCardProps {
  step: number;
  title: string;
  description: string;
  isDone?: boolean;
}

/** 최초 설정 흐름의 단계 카드. 실제 순서가 있는 절차이므로 번호 표기가 정당하다. */
export function OnboardingStepCard({ step, title, description, isDone = false }: OnboardingStepCardProps) {
  return (
    <div className="flex items-start gap-4">
      <span
        className={`font-data flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm
          ${isDone ? 'border-primary bg-primary text-primary-content' : 'border-base-300 text-base-content/50'}`}
      >
        {isDone ? '✓' : step}
      </span>
      <div className="flex flex-col gap-0.5 pt-0.5">
        <h4 className="font-body text-sm font-semibold text-base-content">{title}</h4>
        <p className="font-body text-sm text-base-content/60">{description}</p>
      </div>
    </div>
  );
}
