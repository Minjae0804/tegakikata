interface ProgressStatProps {
  label: string;
  value: string | number;
  suffix?: string;
}

/** 학습 통계 하나를 보여주는 작은 카운터. 데이터는 항상 고정폭 숫자체로. */
export function ProgressStat({ label, value, suffix }: ProgressStatProps) {
  return (
    <div className="flex flex-col gap-1 border-l-2 border-base-300 pl-3">
      <span className="text-xs text-base-content/60">{label}</span>
      <span className="font-data text-2xl font-semibold text-base-content">
        {value}
        {suffix && <span className="ml-0.5 text-sm text-base-content/50">{suffix}</span>}
      </span>
    </div>
  );
}
