// 게임 모드 선택 화면
import { GameModeCard } from '../components/game/GameModeCard';
import { Button } from '../components/common/Button';

interface HomePageProps {
  onSelectFillBlank?: () => void;
  onSelectTranslate?: () => void;
  onSelectWordBank?: () => void;
  onSelectWordBankStudy?: () => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
}

export function HomePage({
  onSelectFillBlank,
  onSelectTranslate,
  onSelectWordBank,
  onSelectWordBankStudy,
  onOpenSettings,
  onLogout,
}: HomePageProps) {
  return (
    <div className="flex flex-col gap-8 p-8">
      <header className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-body text-xs tracking-[0.3em] text-base-content/40 uppercase">Tegakikata</p>
          <h1 className="font-display text-2xl text-base-content">무엇을 연습할까요?</h1>
        </div>
        <div className="flex gap-1">
          {onOpenSettings && (
            <Button variant="ghost" size="sm" onClick={onOpenSettings}>
              설정
            </Button>
          )}
          {onLogout && (
            <Button variant="ghost" size="sm" onClick={onLogout}>
              로그아웃
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4">
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
        <GameModeCard
          mark="習"
          title="단어장 학습"
          description="플래시카드를 다시/어려움/보통/쉬움으로 평가하면, 복습 간격을 알아서 조절해줘요."
          onClick={onSelectWordBankStudy}
        />
      </div>
    </div>
  );
}
