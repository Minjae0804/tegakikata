// 한->일 번역 게임: AI(Gemini/Claude 선택)로 한국어 문장 생성 -> 사용자가 일본어로 입력 -> AI 채점.
// 단어장을 골라두면(빈칸 채우기와 같은 방식) 매 문제마다 2~7개(단어장 크기에 따라 조절) 단어를
// 무작위로 뽑아 힌트로 넣어서, 번역하면 자연스럽게 그 단어들을 쓰게 만든다.
// 단어장이 없으면 AI가 알아서 문장을 만든다.
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/common/Button';
import { FeedbackBanner } from '../components/common/FeedbackBanner';
import { ProgressStat } from '../components/common/ProgressStat';
import { KanaInputPanel, type KanaInputMode } from '../components/game/fill-blank/KanaInputPanel';
import { useAppConfig } from '../hooks/useAppConfig';
import { useGrammarBank } from '../hooks/useGrammarBank';
import type { WordBankController } from '../hooks/useWordBank';
import type { ProgressController } from '../hooks/useProgress';
import { WordBankPicker } from '../components/wordbank/WordBankPicker';
import { GrammarPicker } from '../components/grammar/GrammarPicker';
import { generateTranslateQuestion, gradeTranslation, hasRequiredApiKey } from '../lib/ai/aiClient';
import { shuffle } from '../lib/wordbank/shuffle';
import { hasKanji } from '../lib/wordbank/hasKanji';
import type { TranslateGradeResult, WordEntry } from '../types';

interface TranslateGamePageProps {
  progress: ProgressController;
  wordBank: WordBankController;
  onExit?: () => void;
}

/** 한 문제에 쓸 단어 개수를 무작위로 정한다 — 최소 2개, 최대 7개(단어장이 그보다 작으면 있는 만큼만). */
function randomWordCount(available: number): number {
  if (available <= 0) return 0;
  const min = Math.min(2, available);
  const max = Math.min(7, available);
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function TranslateGamePage({ progress, wordBank, onExit }: TranslateGamePageProps) {
  const { config } = useAppConfig(true);
  const grammarBank = useGrammarBank(true);
  // 나가기 버튼을 누르면(=1분 주기 flush를 기다리지 않고) 밀린 진도를 바로 저장한 뒤 나간다.
  const handleExit = () => {
    void progress.flush();
    onExit?.();
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const [grammarPickerOpen, setGrammarPickerOpen] = useState(false);
  const [wordIndex, setWordIndex] = useState(0);

  // CSV에 적힌 순서 그대로 반복 출제되지 않도록, 단어장이 (다시) 로드될 때마다 한 번 섞어둔다.
  const shuffledWords = useMemo(() => shuffle(wordBank.words), [wordBank.words]);

  const [koreanSentence, setKoreanSentence] = useState<string | null>(null);
  // 이번 문제에 힌트로 쓴 단어들 — 채점 후 "이 문제에 쓰인 단어"로 보여주고, 진도 기록에도 쓴다.
  const [questionWords, setQuestionWords] = useState<WordEntry[]>([]);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);

  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<TranslateGradeResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  // 일반 타이핑 외에, 한자 필기/히라가나/가타카나로도 답을 이어 쓸 수 있게 하는 보조 입력기.
  const [handwritingOpen, setHandwritingOpen] = useState(false);
  const [kanaMode, setKanaMode] = useState<KanaInputMode>('kanji');
  const appendToAnswer = (char: string) => setAnswer((prev) => prev + char);

  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [round, setRound] = useState(0);

  const loadQuestion = async () => {
    if (!config || !hasRequiredApiKey(config) || wordBank.wordsLoading) return;
    setQuestionLoading(true);
    setQuestionError(null);
    try {
      const count = randomWordCount(shuffledWords.length);
      const words = Array.from({ length: count }, (_, i) => shuffledWords[(wordIndex + i) % shuffledWords.length]);
      const generated = await generateTranslateQuestion(config, grammarBank.notes, words.length > 0 ? words : undefined);
      setKoreanSentence(generated.koreanSentence);
      setQuestionWords(words);
    } catch (e) {
      setQuestionError(e instanceof Error ? e.message : '문제를 불러오지 못했습니다.');
    } finally {
      setQuestionLoading(false);
    }
  };

  useEffect(() => {
    void loadQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, round, wordBank.wordsLoading]);

  const handleGrade = async () => {
    if (!answer.trim() || !koreanSentence || !config || !hasRequiredApiKey(config)) return;
    setGrading(true);
    setGradeError(null);
    try {
      const graded = await gradeTranslation(config, koreanSentence, answer.trim());
      setResult(graded);
      setAnsweredCount((n) => n + 1);
      if (graded.isCorrect) setCorrectCount((n) => n + 1);
      // 단어장-단어별 학습 진도(SRS)에 이번 결과를 반영한다 — 이번 문제에 쓰인 단어 전부.
      for (const word of questionWords) progress.recordReview(word.id, graded.isCorrect ? 'good' : 'again');
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : '채점에 실패했습니다.');
    } finally {
      setGrading(false);
    }
  };

  const handleNext = () => {
    setRound((r) => r + 1);
    setWordIndex((i) => i + Math.max(1, questionWords.length));
    setAnswer('');
    setResult(null);
    setKanaMode('kanji');
  };

  if (!hasRequiredApiKey(config)) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <p className="font-body text-sm text-base-content/60">
          AI API 키가 설정되지 않았어요. 온보딩에서 키를 먼저 등록해주세요.
        </p>
        {onExit && (
          <Button variant="ghost" size="sm" onClick={handleExit}>
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
          <Button variant="ghost" size="sm" onClick={handleExit}>
            나가기
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-6">
        <ProgressStat label="맞은 문제" value={correctCount} suffix={`/${answeredCount}`} />
        <ProgressStat label="단어 출처" value={wordBank.words.length > 0 ? '드라이브' : 'AI 생성'} />
        <Button variant="ghost" size="sm" onClick={() => setPickerOpen((v) => !v)}>
          {pickerOpen ? '단어장 선택 닫기' : '단어장 선택'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setGrammarPickerOpen((v) => !v)}>
          {grammarPickerOpen ? '문법 노트 선택 닫기' : '문법 노트 선택'}
        </Button>
      </div>

      {wordBank.wordsError && (
        <p className="font-body text-xs text-secondary">단어장 로드 실패: {wordBank.wordsError}</p>
      )}

      {pickerOpen && (
        <WordBankPicker
          rootFolderId={wordBank.rootFolderId}
          subfolders={wordBank.subfolders}
          csvFiles={wordBank.csvFiles}
          browseLoading={wordBank.browseLoading}
          browseError={wordBank.browseError}
          onBrowse={wordBank.browseFolder}
          selectedFiles={wordBank.selectedFiles}
          wordsLoading={wordBank.wordsLoading}
          onApply={(files) => {
            void wordBank.loadWords(files);
            setPickerOpen(false);
          }}
        />
      )}

      {grammarPickerOpen && (
        <GrammarPicker
          rootFolderId={grammarBank.rootFolderId}
          subfolders={grammarBank.subfolders}
          files={grammarBank.files}
          browseLoading={grammarBank.browseLoading}
          browseError={grammarBank.browseError}
          onBrowse={grammarBank.browseFolder}
          selectedFiles={grammarBank.selectedFiles}
          notesLoading={grammarBank.notesLoading}
          onApply={(files) => {
            void grammarBank.loadNotes(files);
            setGrammarPickerOpen(false);
          }}
        />
      )}

      {(questionLoading || wordBank.wordsLoading) && (
        <p className="font-body text-sm text-base-content/50">
          {wordBank.wordsLoading ? '단어장을 불러오는 중...' : '문장을 만드는 중...'}
        </p>
      )}

      {questionError && (
        <div className="flex flex-col gap-2">
          <p className="font-body text-xs text-secondary">{questionError}</p>
          <Button variant="outline" size="sm" onClick={() => void loadQuestion()}>
            다시 시도
          </Button>
        </div>
      )}

      {koreanSentence && !questionLoading && !wordBank.wordsLoading && (
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

            {result === null && (
              <div className="flex flex-col items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setHandwritingOpen((v) => !v)}>
                  {handwritingOpen ? '한자/가나 입력기 닫기' : '✏️ 한자/가나 입력기로 이어 쓰기'}
                </Button>

                {handwritingOpen && (
                  <div className="flex w-full flex-col items-center gap-3 rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-4">
                    <span className="font-body text-xs text-base-content/50">고르면 답에 이어붙어요</span>
                    <KanaInputPanel key={round} mode={kanaMode} onModeChange={setKanaMode} onSelect={appendToAnswer} />
                  </div>
                )}
              </div>
            )}

            {gradeError && <p className="font-body text-xs text-secondary">{gradeError}</p>}

            {result === null ? (
              <Button variant="primary" onClick={() => void handleGrade()} disabled={!answer.trim() || grading}>
                {grading ? '채점하는 중...' : '채점하기'}
              </Button>
            ) : (
              <>
                <FeedbackBanner status={result.isCorrect ? 'correct' : 'incorrect'} message={result.feedback} />
                {questionWords.length > 0 && (
                  <p className="font-body text-xs text-base-content/50">
                    이 문제에 쓰인 단어:{' '}
                    {questionWords
                      .map((w) => `「${hasKanji(w) ? `${w.kanji}(${w.reading})` : w.reading}」 — ${w.meaning}`)
                      .join(', ')}
                  </p>
                )}
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
