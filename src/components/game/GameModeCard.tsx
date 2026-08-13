import type { ReactNode } from 'react';

interface GameModeCardProps {
  mark: string; // 게임 성격을 나타내는 한 글자/기호
  title: string;
  description: string;
  onClick?: () => void;
  children?: ReactNode;
}

/** 홈 화면의 게임 모드 선택 카드 (빈칸 채우기 / 번역). */
export function GameModeCard({ mark, title, description, onClick, children }: GameModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-64 flex-col gap-4 rounded-[var(--radius-box)] border-2 border-base-300
                 bg-base-100 p-5 text-left transition-colors hover:border-primary"
    >
      <span
        className="font-jp flex h-11 w-11 items-center justify-center rounded-full
                   border-2 border-primary text-xl text-primary group-hover:bg-primary group-hover:text-primary-content"
      >
        {mark}
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg text-base-content">{title}</h3>
        <p className="font-body text-sm text-base-content/60">{description}</p>
      </div>
      {children}
    </button>
  );
}