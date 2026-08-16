import type { ReactNode } from 'react';

interface GameModeCardProps {
  mark: string; // 게임 성격을 나타내는 한 글자/기호
  title: string;
  description: string;
  onClick?: () => void;
  /** AI 키가 없어서 이 게임을 못 쓰는 경우 등 — 클릭 막고 흐리게 표시한다. */
  disabled?: boolean;
  /** disabled일 때 description 아래에 이유를 짧게 덧붙인다 (예: "AI 설정이 필요해요"). */
  disabledNote?: string;
  children?: ReactNode;
}

/** 홈 화면의 게임 모드 선택 카드 (빈칸 채우기 / 번역). */
export function GameModeCard({ mark, title, description, onClick, disabled, disabledNote, children }: GameModeCardProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`group flex w-full flex-col gap-4 rounded-[var(--radius-box)] border-2 p-5 text-left transition-colors ${
        disabled
          ? 'cursor-not-allowed border-base-300 bg-base-100 opacity-50'
          : 'border-base-300 bg-base-100 hover:border-primary'
      }`}
    >
      <span
        className={`font-jp flex h-11 w-11 items-center justify-center rounded-full border-2 border-primary text-xl text-primary ${
          disabled ? '' : 'group-hover:bg-primary group-hover:text-primary-content'
        }`}
      >
        {mark}
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg text-base-content">{title}</h3>
        <p className="font-body text-sm text-base-content/60">{description}</p>
        {disabled && disabledNote && <p className="font-body text-xs text-secondary">{disabledNote}</p>}
      </div>
      {children}
    </button>
  );
}