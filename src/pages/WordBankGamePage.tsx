// 단어장 맞추기 게임: 빈칸 채우기/번역과 달리 AI가 문제를 지어내지 않고, 사용자가 고른
// 단어장(useWordBank)에 있는 단어만으로 출제한다. 두 방향을 지원한다.
//  - "뜻·읽기 → 한자": 뜻과 읽기를 보고 한자를 필기로 쓴다. AI 미사용 — 단어장 데이터와
//    글자 그대로 비교해서 채점한다.
//  - "한자 → 읽기·뜻": 한자만 보고 읽기(히라가나)와 뜻(한국어)을 답한다. 오탈자/동의어처럼
//    유연하게 봐줘야 하는 채점이라 AI(Gemini/Claude)로 채점한다.
import { useMemo, useState } from 'react';
import { HandwritingFrame } from '../components/handwriting/HandwritingFrame';
import { CandidateChips } from '../components/game/fill-blank/CandidateChips';
import { HiraganaKeyboard } from '../components/game/fill-blank/HiraganaKeyboard';
import { FeedbackBanner } from '../components/common/FeedbackBanner';
import { ProgressStat } from '../components/common/ProgressStat';
import { Button } from '../components/common/Button';
import { useAppConfig } from '../hooks/useAppConfig';
import { useWordBank } from '../hooks/useWordBank';
import { WordBankPicker } from '../components/wordbank/WordBankPicker';
import { gradeWordRecall, hasRequiredApiKey } from '../lib/ai/aiClient';
import { shuffle } from '../lib/wordbank/shuffle';
import type { WordRecallGradeResult } from '../types';

interface WordBankGamePageProps {
  onExit?: () => void;
}

type Direction = 'toKanji' | 'toReading';

export function WordBankGamePage({ onExit }: WordBankGamePageProps) {
  const { config } = useAppConfig(true);
  const wordBank = useWordBank(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>('toKanji');
  const [round, setRound] = useState(0);

  // CSV에 적힌 순서 그대로 반복 출제되지 않도록, 단어장이 (다시) 로드될 때마다 한 번 섞어둔다.
  const shuffledWords = useMemo(() => shuffle(wordBank.words), [wordBank.words]);
  const word = shuffledWords.length > 0 ? shuffledWords[round % shuffledWords.length] : null;

  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);

  // "뜻·읽기 → 한자" 상태
  const [enteredChars, setEnteredChars] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [canvasKey, setCanvasKey] = useState(0);
  const [inputMode, setInputMode] = useState<'kanji' | 'hiragana'>('kanji');
  const [submitted, setSubmitted] = useState(false);

  // "한자 → 읽기·뜻" 상태
  const [readingChars, setReadingChars] = useState<string[]>([]);
  const [meaningAnswer, setMeaningAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [recallResult, setRecallResult] = useState<WordRecallGradeResult | null>(null);

  const enteredText = enteredChars.join('');
  const readingText = readingChars.join('');
  const isKanjiCorrect = submitted && word !== null && enteredText === word.kanji;

  const resetToKanjiInput = () => {
    setEnteredChars([]);
    setCandidates([]);
    setSubmitted(false);
    setCanvasKey((k) => k + 1);
  };

  const resetToReadingInput = () => {
    setReadingChars([]);
    setMeaningAnswer('');
    setRecallResult(null);
    setGradeError(null);
  };

  const handleDirectionChange = (next: Direction) => {
    if (next === direction) return;
    setDirection(next);
    resetToKanjiInput();
    resetToReadingInput();
  };

  const handleNext = () => {
    setRound((r) => r + 1);
    resetToKanjiInput();
    resetToReadingInput();
  };

  /** "뜻·읽기 → 한자" 채점 — AI 미사용, 단어장 데이터와 문자열 그대로 비교. */
  const handleSubmitKanji = () => {
    if (enteredChars.length === 0 || !word) return;
    setSubmitted(true);
    setAnsweredCount((n) => n + 1);
    if (enteredText === word.kanji) setCorrectCount((n) => n + 1);
  };

  /** "한자 → 읽기·뜻" 채점 — AI 사용. */
  const handleGradeReading = async () => {
    if (!word || !config || !hasRequiredApiKey(config)) return;
    if (readingText.trim() === '' && meaningAnswer.trim() === '') return;
    setGrading(true);
    setGradeError(null);
    try {
      const graded = await gradeWordRecall(config, word, readingText.trim(), meaningAnswer.trim());
      setRecallResult(graded);
      setAnsweredCount((n) => n + 1);
      if (graded.readingCorrect && graded.meaningCorrect) setCorrectCount((n) => n + 1);
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : '채점에 실패했습니다.');
    } finally {
      setGrading(false);
    }
  };

  const wordBankEmpty = !wordBank.wordsLoading && shuffledWords.length === 0;
  const blockedByMissingApiKey = direction === 'toReading' && !hasRequiredApiKey(config);

  return (
    <div className="flex flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-body text-xs tracking-[0.3em] text-base-content/40 uppercase">단어장 맞추기</p>
          <h1 className="font-display text-xl text-base-content">내 단어장으로 연습해요</h1>
        </div>
        {onExit && (
          <Button variant="ghost" size="sm" onClick={onExit}>
            나가기
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-6">
        <ProgressStat label="맞은 문제" value={correctCount} suffix={`/${answeredCount}`} />
        {word?.jlptLevel && <ProgressStat label="JLPT" value={word.jlptLevel} />}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handleDirectionChange('toKanji')}
            className={`btn btn-sm rounded-[var(--radius-field)] ${
              direction === 'toKanji' ? 'btn-primary' : 'btn-outline'
            }`}
          >
            뜻·읽기 → 한자
          </button>
          <button
            type="button"
            onClick={() => handleDirectionChange('toReading')}
            className={`btn btn-sm rounded-[var(--radius-field)] ${
              direction === 'toReading' ? 'btn-primary' : 'btn-outline'
            }`}
          >
            한자 → 읽기·뜻 (AI 채점)
          </button>
        </div>
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

      {wordBank.wordsLoading && (
        <p className="font-body text-sm text-base-content/50">단어장을 불러오는 중...</p>
      )}

      {wordBankEmpty && (
        <div className="flex flex-col gap-2">
          <p className="font-body text-sm text-base-content/60">
            이 게임은 단어장이 있어야 문제를 낼 수 있어요. "단어장 선택"에서 CSV를 먼저 골라주세요.
          </p>
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            단어장 선택하기
          </Button>
        </div>
      )}

      {blockedByMissingApiKey && (
        <p className="font-body text-sm text-base-content/60">
          AI API 키가 설정되지 않았어요. 온보딩에서 키를 등록하거나, 위에서 "뜻·읽기 → 한자" 방향으로
          바꿔서 AI 없이 풀어보세요.
        </p>
      )}

      {word && !wordBank.wordsLoading && (
        <>
          {direction === 'toKanji' ? (
            <>
              <div className="flex flex-col items-center gap-1 rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-5">
                <span className="font-body text-xs text-base-content/50">뜻을 보고 한자를 써보세요</span>
                <p className="font-body text-2xl text-base-content">{word.meaning}</p>
                <p className="font-jp text-base text-base-content/50">{word.reading}</p>
              </div>

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
                  <Button variant="ghost" size="sm" onClick={() => setEnteredChars((prev) => prev.slice(0, -1))}>
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
                      <HandwritingFrame key={canvasKey} onRecognize={setCandidates} onClear={() => setCandidates([])} />
                      {candidates.length > 0 && (
                        <div className="flex flex-col items-center gap-2">
                          <span className="font-body text-xs text-base-content/50">
                            인식 후보 — 고르면 입력한 글자에 추가돼요
                          </span>
                          <CandidateChips
                            candidates={candidates}
                            onSelect={(c) => {
                              setEnteredChars((prev) => [...prev, c]);
                              setCandidates([]);
                              setCanvasKey((k) => k + 1);
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {inputMode === 'hiragana' && (
                    <HiraganaKeyboard onSelect={(c) => setEnteredChars((prev) => [...prev, c])} />
                  )}

                  <Button variant="primary" onClick={handleSubmitKanji} disabled={enteredChars.length === 0}>
                    제출
                  </Button>
                </div>
              )}

              {submitted && (
                <div className="flex flex-col gap-3">
                  <FeedbackBanner
                    status={isKanjiCorrect ? 'correct' : 'incorrect'}
                    message={
                      isKanjiCorrect
                        ? `정답이에요. 「${word.kanji}(${word.reading})」 — ${word.meaning}`
                        : `아쉬워요, 정답은 「${word.kanji}(${word.reading})」예요. (입력한 답: 「${enteredText}」)`
                    }
                  />
                  <Button variant="primary" onClick={handleNext}>
                    다음 문제
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-1 rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-5">
                <span className="font-body text-xs text-base-content/50">한자를 보고 읽기와 뜻을 답해보세요</span>
                <p className="font-jp text-4xl text-base-content">{word.kanji}</p>
              </div>

              {!blockedByMissingApiKey && recallResult === null && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col items-center gap-2">
                    <span className="font-body text-xs text-base-content/50">읽기 (히라가나)</span>
                    <div className="flex min-h-14 min-w-14 items-center gap-1 rounded-[var(--radius-box)] border-2 border-base-300 bg-base-100 px-4 py-2">
                      {readingChars.length === 0 ? (
                        <span className="font-body text-xs text-base-content/30 select-none">
                          아래 버튼으로 히라가나를 입력하세요
                        </span>
                      ) : (
                        readingChars.map((char, i) => (
                          <span key={i} className="font-jp text-2xl text-base-content">
                            {char}
                          </span>
                        ))
                      )}
                    </div>
                    {readingChars.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setReadingChars((prev) => prev.slice(0, -1))}>
                        마지막 글자 지우기
                      </Button>
                    )}
                    <HiraganaKeyboard onSelect={(c) => setReadingChars((prev) => [...prev, c])} />
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="font-body text-xs text-base-content/60">뜻 (한국어)</span>
                    <textarea
                      value={meaningAnswer}
                      onChange={(e) => setMeaningAnswer(e.target.value)}
                      rows={2}
                      className="font-body textarea textarea-bordered w-full rounded-[var(--radius-field)] text-base"
                      placeholder="뜻을 한국어로 적어보세요"
                    />
                  </label>

                  {gradeError && <p className="font-body text-xs text-secondary">{gradeError}</p>}

                  <Button
                    variant="primary"
                    onClick={() => void handleGradeReading()}
                    disabled={grading || (readingText.trim() === '' && meaningAnswer.trim() === '')}
                  >
                    {grading ? '채점하는 중...' : '채점하기'}
                  </Button>
                </div>
              )}

              {recallResult && (
                <div className="flex flex-col gap-3">
                  <FeedbackBanner
                    status={recallResult.readingCorrect && recallResult.meaningCorrect ? 'correct' : 'incorrect'}
                    message={recallResult.feedback}
                  />
                  <p className="font-body text-xs text-base-content/50">
                    정답 — 읽기: 「{word.reading}」 · 뜻: {word.meaning}
                  </p>
                  <Button variant="primary" onClick={handleNext}>
                    다음 문제
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
