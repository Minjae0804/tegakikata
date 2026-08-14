// 게임 모드 선택 화면
import { GameModeCard } from '../components/game/GameModeCard';

interface HomePageProps {
  onSelectFillBlank?: () => void;
  onSelectTranslate?: () => void;
  onSelectWordBank?: () => void;
}

export function HomePage({ onSelectFillBlank, onSelectTranslate, onSelectWordBank }: HomePageProps) {
  return (
    <div className="flex flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <p className="font-body text-xs tracking-[0.3em] text-base-content/40 uppercase">Tegakikata</p>
        <h1 className="font-display text-2xl text-base-content">무엇을 연습할까요?</h1>
      </header>

      <div className="flex flex-col gap-4">
        <GameModeCard
          mark="埋"
          title="빈칸 채우기"
          description="문장의 빈칸에 들어갈 한자를 필기로 입력해요."
          onClick={onSelectFillBlank}
        />
        <GameModeCard
          mark="訳"
          title="문장 번역"
          description="한국어 문장을 일본어로 옮기면 AI가 채점해요."
          onClick={onSelectTranslate}
        />
        <GameModeCard
          mark="単"
          title="단어장 맞추기"
          description="내가 고른 단어장으로만 연습해요. 한자 쓰기는 AI 없이, 읽기·뜻 맞히기는 AI가 채점해요."
          onClick={onSelectWordBank}
        />
      </div>
    </div>
  );
}
