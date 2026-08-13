// 빈칸 채우기 게임: AI(Gemini/Claude 선택)로 예문 생성 -> 필기 입력 -> kanjicanvas 후보 -> 선택 -> 제출 -> 채점
//
// 캔버스는 하나만 두고 한 글자씩 쓴다. 글자를 확정(후보 선택)할 때마다 위쪽 "입력한 글자" 칸에
// 쌓이고, 캔버스는 다음 글자를 위해 초기화된다. 정답 단어가 여러 글자여도(勉強 등) 이 방식으로
// 순서대로 이어 쓸 수 있고, 다 쓴 뒤 "제출" 버튼을 눌러야 한 번에 채점한다.
//
// 단어 풀은 드라이브 wordbanks/ 폴더에서 사용자가 직접 고른 CSV(useWordBank)를 우선 쓰고,
// 아직 아무것도 선택 안 했으면 임시 샘플로 대체한다. "단어장 선택" 버튼으로 하위 폴더 -> CSV 파일
// 순서로 탐색해서 원하는 파일만 골라 적용할 수 있다.
// AI 예문 생성 시 grammar.md(useGrammarNotes)를 컨텍스트로 같이 넘긴다.
import { useEffect, useState } from 'react';
import { HandwritingFrame } from '../components/handwriting/HandwritingFrame';
import { CandidateChips } from '../components/game/fill-blank/CandidateChips';
import { HiraganaKeyboard } from '../components/game/fill-blank/HiraganaKeyboard';
import { FeedbackBanner } from '../components/common/FeedbackBanner';
import { ProgressStat } from '../components/common/ProgressStat';
import { Button } from '../components/common/Button';
import { useAppConfig } from '../hooks/useAppConfig';
import { useWordBank } from '../hooks/useWordBank';
import { WordBankPicker } from '../components/wordbank/WordBankPicker';
import { useGrammarNotes } from '../hooks/useGrammarNotes';
import { generateFillBlankQuestion, hasRequiredApiKey } from '../lib/ai/aiClient';
import type { FillBlankQuestion } from '../types';

interface FillBlankGamePageProps {
  onExit?: () => void;
}

export function FillBlankGamePage({ onExit }: FillBlankGamePageProps) {
  const { config } = useAppConfig(true);
  const wordBank = useWordBank(true);
  const { notes: grammarNotes } = useGrammarNotes(true);

  const [pickerOpen, setPickerOpen] = useState(false);

  const [question, setQuestion] = useState<FillBlankQuestion | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);

  // 지금까지 확정한 글자들 (입력 칸에 쌓이는 값)
  const [enteredChars, setEnteredChars] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [canvasKey, setCanvasKey] = useState(0); // 글자 확정마다 올려서 캔버스를 강제로 리셋

  const [submitted, setSubmitted] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const [inputMode, setInputMode] = useState<'kanji' | 'hiragana'>('kanji');

  const enteredText = enteredChars.join('');
  const isCorrect = submitted && question !== null && enteredText === question.targetWord.kanji;

  const loadQuestion = async () => {
    if (!config || !hasRequiredApiKey(config) || wordBank.wordsLoading) return;
    setQuestionLoading(true);
    setQuestionError(null);
    try {
      const word = wordBank.words.length > 0 ? wordBank.words[wordIndex % wordBank.words.length] : undefined;
      const generated = await generateFillBlankQuestion(config, word, grammarNotes);
      setQuestion(generated);
    } catch (e) {
      setQuestionError(e instanceof Error ? e.message : '문제를 불러오지 못했습니다.');
    } finally {
      setQuestionLoading(false);
    }
  };

  useEffect(() => {
    void loadQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, wordIndex, wordBank.wordsLoading]);

  const handleRecognize = (result: string[]) => {
    setCandidates(result);
  };

  const handleSelectCandidate = (candidate: string) => {
    if (submitted) return;
    setEnteredChars((prev) => [...prev, candidate]);
    setCandidates([]);
    setCanvasKey((k) => k + 1); // 캔버스 리셋 -> 다음 글자 준비
  };

  /** 히라가나 버튼 클릭 — 필기 캔버스와 무관하게 바로 입력한 글자에 추가한다. */
  const handleAddHiragana = (char: string) => {
    if (submitted) return;
    setEnteredChars((prev) => [...prev, char]);
  };

  const handleRemoveLast = () => {
    if (submitted || enteredChars.length === 0) return;
    setEnteredChars((prev) => prev.slice(0, -1));
  };

  const handleSubmit = () => {
    if (enteredChars.length === 0 || !question) return;
    setSubmitted(true);
    setAnsweredCount((n) => n + 1);
    if (enteredText === question.targetWord.kanji) setCorrectCount((n) => n + 1);
  };

  const handleNext = () => {
    setWordIndex((i) => i + 1);
    setEnteredChars([]);
    setCandidates([]);
    setSubmitted(false);
    setCanvasKey((k) => k + 1);
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
          <p className="font-body text-xs tracking-[0.3em] text-base-content/40 uppercase">빈칸 채우기</p>
          <h1 className="font-display text-xl text-base-content">한자를 필기로 채워보세요</h1>
        </div>
        {onExit && (
          <Button variant="ghost" size="sm" onClick={onExit}>
            나가기
          </Button>
        )}
      </header>

      <div className="flex items-center gap-6">
        <ProgressStat label="맞은 문제" value={correctCount} suffix={`/${answeredCount}`} />
        {question && <ProgressStat label="JLPT" value={question.targetWord.jlptLevel ?? '-'} />}
        <ProgressStat label="단어 출처" value={wordBank.words.length > 0 ? '드라이브' : 'AI 생성'} />
        <Button variant="ghost" size="sm" onClick={() => setPickerOpen((v) => !v)}>
          {pickerOpen ? '단어장 선택 닫기' : '단어장 선택'}
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

      {(questionLoading || wordBank.wordsLoading) && (
        <p className="font-body text-sm text-base-content/50">
          {wordBank.wordsLoading ? '단어장을 불러오는 중...' : '예문을 만드는 중...'}
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

      {question && !questionLoading && !wordBank.wordsLoading && (
        <>
          {(() => {
            const [sentenceBefore, sentenceAfter] = question.sentence.split('___');
            return (
              <p className="font-jp rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-5 text-xl text-base-content">
                {sentenceBefore}
                <span className="mx-1 inline-block min-w-[2.5em] border-b-2 border-primary text-center text-primary">
                  {enteredText || '　'}
                </span>
                {sentenceAfter}
              </p>
            );
          })()}

          {/* 입력한 글자를 쌓아 보여주는 칸 */}
          <div className="flex flex-col items-center gap-2">
            <span className="font-body text-xs text-base-content/50">입력한 글자</span>
            <div className="flex min-h-14 min-w-14 items-center gap-1 rounded-[var(--radius-box)] border-2 border-base-300 bg-base-100 px-4 py-2">
              {enteredChars.length === 0 ? (
                <span className="font-body text-xs text-base-content/30 select-none">
                  아래에서 한 글자씩 써서 채워보세요
                </span>
              ) : (
                enteredChars.map((char, i) => (
                  <span key={i} className="font-jp text-2xl text-base-content">
                    {char}
                  </span>
                ))
              )}
            </div>
            {!submitted && enteredChars.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleRemoveLast}>
                마지막 글자 지우기
              </Button>
            )}
          </div>

          {!submitted && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setInputMode('kanji')}
                  className={`btn btn-sm rounded-[var(--radius-field)] ${
                    inputMode === 'kanji' ? 'btn-primary' : 'btn-outline'
                  }`}
                >
                  한자 입력
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('hiragana')}
                  className={`btn btn-sm rounded-[var(--radius-field)] ${
                    inputMode === 'hiragana' ? 'btn-primary' : 'btn-outline'
                  }`}
                >
                  히라가나 입력
                </button>
              </div>

              {inputMode === 'kanji' && (
                <div className="flex flex-col items-center gap-3">
                  <HandwritingFrame key={canvasKey} onRecognize={handleRecognize} onClear={() => setCandidates([])} />

                  {candidates.length > 0 && (
                    <div className="flex flex-col items-center gap-2">
                      <span className="font-body text-xs text-base-content/50">
                        인식 후보 — 고르면 입력한 글자에 추가돼요
                      </span>
                      <CandidateChips candidates={candidates} onSelect={handleSelectCandidate} />
                    </div>
                  )}
                </div>
              )}

              {inputMode === 'hiragana' && (
                <div className="flex flex-col items-center gap-3">
                  <HiraganaKeyboard onSelect={handleAddHiragana} />
                </div>
              )}

              <Button variant="primary" onClick={handleSubmit} disabled={enteredChars.length === 0}>
                제출
              </Button>
            </div>
          )}

          {submitted && (
            <div className="flex flex-col gap-3">
              <FeedbackBanner
                status={isCorrect ? 'correct' : 'incorrect'}
                message={
                  isCorrect
                    ? `정답이에요. 「${question.targetWord.kanji}(${question.targetWord.reading})」 — ${question.targetWord.meaning}`
                    : `아쉬워요, 정답은 「${question.targetWord.kanji}(${question.targetWord.reading})」예요. (입력한 답: 「${enteredText}」)`
                }
              />
              <Button variant="primary" onClick={handleNext}>
                다음 문제
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
