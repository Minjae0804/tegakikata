// 한->일 번역 게임: AI(Gemini/Claude 선택)로 한국어 문장 생성 -> 사용자가 일본어로 입력 -> AI 채점
import { useEffect, useState } from 'react';
import { Button } from '../components/common/Button';
import { FeedbackBanner } from '../components/common/FeedbackBanner';
import { ProgressStat } from '../components/common/ProgressStat';
import { useAppConfig } from '../hooks/useAppConfig';
import { useGrammarNotes } from '../hooks/useGrammarNotes';
import { generateTranslateQuestion, gradeTranslation, hasRequiredApiKey } from '../lib/ai/aiClient';
import type { TranslateGradeResult } from '../types';

interface TranslateGamePageProps {
  onExit?: () => void;
}

export function TranslateGamePage({ onExit }: TranslateGamePageProps) {
  const { config } = useAppConfig(true);
  const { notes: grammarNotes } = useGrammarNotes(true);

  const [koreanSentence, setKoreanSentence] = useState<string | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);

  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<TranslateGradeResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [round, setRound] = useState(0);

  const loadQuestion = async () => {
    if (!config || !hasRequiredApiKey(config)) return;
    setQuestionLoading(true);
    setQuestionError(null);
    try {
      const generated = await generateTranslateQuestion(config, grammarNotes);
      setKoreanSentence(generated.koreanSentence);
    } catch (e) {
      setQuestionError(e instanceof Error ? e.message : '문제를 불러오지 못했습니다.');
    } finally {
      setQuestionLoading(false);
    }
  };

  useEffect(() => {
    void loadQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, round]);

  const handleGrade = async () => {
    if (!answer.trim() || !koreanSentence || !config || !hasRequiredApiKey(config)) return;
    setGrading(true);
    setGradeError(null);
    try {
      const graded = await gradeTranslation(config, koreanSentence, answer.trim());
      setResult(graded);
      setAnsweredCount((n) => n + 1);
      if (graded.isCorrect) setCorrectCount((n) => n + 1);
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : '채점에 실패했습니다.');
    } finally {
      setGrading(false);
    }
  };

  const handleNext = () => {
    setRound((r) => r + 1);
    setAnswer('');
    setResult(null);
  };

  if (!hasRequiredApiKey(config)) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <p className="font-body text-sm text-base-content/60">
          AI API 키가 설정되지 않았어요. 온보딩에서 키를 먼저 등록해주세요.
        </p>
        {onExit && (
          <Button variant="ghost" size="sm" onClick={onExit}>
            나가기
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-body text-xs tracking-[0.3em] text-base-content/40 uppercase">문장 번역</p>
          <h1 className="font-display text-xl text-base-content">일본어로 옮겨보세요</h1>
        </div>
        {onExit && (
          <Button variant="ghost" size="sm" onClick={onExit}>
            나가기
          </Button>
        )}
      </header>

      <ProgressStat label="맞은 문제" value={correctCount} suffix={`/${answeredCount}`} />

      {questionLoading && <p className="font-body text-sm text-base-content/50">문장을 만드는 중...</p>}

      {questionError && (
        <div className="flex flex-col gap-2">
          <p className="font-body text-xs text-secondary">{questionError}</p>
          <Button variant="outline" size="sm" onClick={() => void loadQuestion()}>
            다시 시도
          </Button>
        </div>
      )}

      {koreanSentence && !questionLoading && (
        <>
          <p className="font-body rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-5 text-lg text-base-content">
            {koreanSentence}
          </p>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-body text-xs text-base-content/60">일본어 번역</span>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={result !== null || grading}
                rows={3}
                className="font-jp textarea textarea-bordered w-full rounded-[var(--radius-field)] text-base"
                placeholder="ここに書いてください"
              />
            </label>

            {gradeError && <p className="font-body text-xs text-secondary">{gradeError}</p>}

            {result === null ? (
              <Button variant="primary" onClick={() => void handleGrade()} disabled={!answer.trim() || grading}>
                {grading ? '채점하는 중...' : '채점하기'}
              </Button>
            ) : (
              <>
                <FeedbackBanner status={result.isCorrect ? 'correct' : 'incorrect'} message={result.feedback} />
                <Button variant="primary" onClick={handleNext}>
                  다음 문제
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
