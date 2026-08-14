import { useState } from 'react';
import { Button } from '../components/common/Button';
import { JlptBadge } from '../components/common/JlptBadge';
import { ProgressStat } from '../components/common/ProgressStat';
import { FeedbackBanner } from '../components/common/FeedbackBanner';
import { WordCard } from '../components/common/WordCard';
import { HandwritingFrame } from '../components/handwriting/HandwritingFrame';
import { CandidateChips } from '../components/game/fill-blank/CandidateChips';
import { GameModeCard } from '../components/game/GameModeCard';
import { OnboardingStepCard } from '../components/onboarding/OnboardingStepCard';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-base-300 pt-8 first:border-t-0 first:pt-0">
      <h2 className="font-display text-sm tracking-[0.2em] text-base-content/40 uppercase">{title}</h2>
      <div className="flex flex-wrap items-start gap-6">{children}</div>
    </section>
  );
}

export function ComponentShowcasePage() {
  const [selected, setSelected] = useState<string | undefined>();
  const [sampleSelected, setSampleSelected] = useState<string | undefined>();
  const [recognized, setRecognized] = useState<string[]>([]);

  return (
    <div className="min-h-screen px-6 py-10 md:px-12">
      <div className="mx-auto max-w-5xl rounded-[var(--radius-box)] border border-base-300 bg-white p-8 shadow-sm md:p-12">
      <header className="mb-12 flex flex-col gap-1">
        <p className="font-body text-xs tracking-[0.3em] text-base-content/40 uppercase">
          Component Showcase
        </p>
        <h1 className="font-display text-3xl text-base-content">テガキカタ 컴포넌트</h1>
      </header>

      <div className="flex flex-col gap-10">
        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">필기로 채점하기</Button>
            <Button variant="secondary">다시 그리기</Button>
            <Button variant="outline">건너뛰기</Button>
            <Button variant="ghost">취소</Button>
            <Button variant="primary" size="sm">
              추가
            </Button>
          </div>
        </Section>

        <Section title="Badges & Stats">
          <div className="flex items-center gap-2">
            <JlptBadge level="N5" />
            <JlptBadge level="N3" />
            <JlptBadge level="N1" />
          </div>
          <div className="flex gap-8">
            <ProgressStat label="복습한 단어" value={128} suffix="개" />
            <ProgressStat label="정답률" value={82} suffix="%" />
            <ProgressStat label="연속 학습" value={6} suffix="일" />
          </div>
        </Section>

        <Section title="Feedback">
          <div className="flex w-full max-w-sm flex-col gap-3">
            <FeedbackBanner status="correct" message="정답이에요. 획순까지 정확했어요." />
            <FeedbackBanner status="incorrect" message="아쉬워요, 정답은 「食べる」예요." />
          </div>
        </Section>

        <Section title="Word Card">
          <WordCard word={{ id: '1', kanji: '食', reading: 'たべる', meaning: '먹다', jlptLevel: 'N5' }} />
          <WordCard word={{ id: '2', kanji: '経済', reading: 'けいざい', meaning: '경제', jlptLevel: 'N2' }} />
        </Section>

        <Section title="Handwriting Frame (Signature)">
          <div className="flex flex-col gap-4">
            <HandwritingFrame
              onRecognize={(candidates) => {
                setRecognized(candidates);
                setSelected(undefined);
              }}
            />
            {recognized.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="font-body text-xs text-base-content/50">인식 후보 (직접 그려서 테스트해보세요)</span>
                <CandidateChips candidates={recognized} selected={selected} onSelect={setSelected} />
              </div>
            )}
          </div>
        </Section>

        <Section title="Candidate Chips (예시 데이터)">
          <CandidateChips
            candidates={['食', '飠', '飤', '飲', '餐']}
            correctAnswer="食"
            selected={sampleSelected}
            onSelect={setSampleSelected}
          />
        </Section>

        <Section title="Game Mode Cards">
          <div className="w-64">
            <GameModeCard mark="埋" title="빈칸 채우기" description="문장의 빈칸에 들어갈 한자를 필기로 입력해요." />
          </div>
          <div className="w-64">
            <GameModeCard mark="訳" title="문장 번역" description="한국어 문장을 일본어로 옮기면 AI가 채점해요." />
          </div>
        </Section>

        <Section title="Onboarding Steps">
          <div className="flex w-full max-w-sm flex-col gap-5">
            <OnboardingStepCard step={1} title="구글 드라이브 연결" description="학습 데이터를 저장할 계정을 연결해요." isDone />
            <OnboardingStepCard step={2} title="Claude API 키 등록" description="드라이브의 설정 파일에 키를 저장해요." />
            <OnboardingStepCard step={3} title="첫 단어장 업로드" description="CSV나 JSON으로 단어장을 가져와요." />
          </div>
        </Section>
      </div>
      </div>
    </div>
  );
}
