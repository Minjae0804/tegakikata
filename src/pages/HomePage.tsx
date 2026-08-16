// 게임 모드 선택 화면
import { GameModeCard } from '../components/game/GameModeCard';
import { Button } from '../components/common/Button';
import { useAppConfig } from '../hooks/useAppConfig';
import { hasRequiredApiKey } from '../lib/ai/aiClient';

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
  // AI API 키는 이제 선택사항이다 — 안 넣었으면 AI가 꼭 필요한 게임(빈칸 채우기/번역)은
  // 여기서부터 막아서 헛클릭 후 페이지 안에서 에러 문구를 보는 일이 없게 한다. 단어장 맞추기/
  // 단어장 학습은 AI 없이도(또는 AI 없이 쓸 수 있는 방향만) 계속 쓸 수 있다.
  const { config } = useAppConfig(true);
  const aiAvailable = hasRequiredApiKey(config);

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
          disabled={!aiAvailable}
          disabledNote="AI 설정이 필요해요"
        />
        <GameModeCard
          mark="訳"
          title="문장 번역"
          description="한국어 문장을 일본어로 옮기면 AI가 채점해요."
          onClick={onSelectTranslate}
          disabled={!aiAvailable}
          disabledNote="AI 설정이 필요해요"
        />
        <GameModeCard
          mark="単"
          title="단어장 맞추기"
          description="내가 고른 단어장으로만 연습해요. 한자 쓰기는 AI 없이, 읽기·뜻 맞히기는 AI가 채점해요(토글로 끌 수 있어요)."
          onClick={onSelectWordBank}
        />
        <GameModeCard
          mark="習"
          title="단어장 학습"
          description="복습이 급한 단어부터 순서대로 보여주는 플래시카드예요. AI가 필요 없어요."
          onClick={onSelectWordBankStudy}
        />
      </div>
    </div>
  );
}
