// 단어장 맞추기 게임: 빈칸 채우기/번역과 달리 AI가 문제를 지어내지 않고, 사용자가 고른
// 단어장(useWordBank)에 있는 단어만으로 출제한다. 두 방향을 지원한다.
//  - "뜻·읽기 → 한자": 뜻과 읽기를 보고 한자를 필기로 쓴다. AI 미사용 — 단어장 데이터와
//    글자 그대로 비교해서 채점한다.
//  - "한자 → 읽기·뜻": 한자만 보고 읽기(히라가나)와 뜻(한국어)을 답한다. 오탈자/동의어처럼
//    유연하게 봐줘야 하는 채점이라 AI(Gemini/Claude)로 채점한다.
import { useEffect, useMemo, useState } from 'react';
import { KanaInputPanel, type KanaInputMode } from '../components/game/fill-blank/KanaInputPanel';
import { FeedbackBanner } from '../components/common/FeedbackBanner';
import { ProgressStat } from '../components/common/ProgressStat';
import { Button } from '../components/common/Button';
import { useAppConfig } from '../hooks/useAppConfig';
import { useWordBank } from '../hooks/useWordBank';
import type { ProgressController } from '../hooks/useProgress';
import { WordBankPicker } from '../components/wordbank/WordBankPicker';
import { gradeWordRecall, hasRequiredApiKey } from '../lib/ai/aiClient';
import { shuffle } from '../lib/wordbank/shuffle';
import { normalizeForMatch } from '../lib/kana/answerMatch';
import { hasKanji } from '../lib/wordbank/hasKanji';
import type { WordRecallGradeResult } from '../types';

interface WordBankGamePageProps {
  progress: ProgressController;
  onExit?: () => void;
}

type Direction = 'toKanji' | 'toReading';

export function WordBankGamePage({ progress, onExit }: WordBankGamePageProps) {
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
  const [inputMode, setInputMode] = useState<KanaInputMode>('kanji');
  const [submitted, setSubmitted] = useState(false);
  // 정답을 시도하지 않고 넘긴 경우 — submitted와 별개로, 오답 취급하되 메시지를 다르게 보여준다.
  const [skipped, setSkipped] = useState(false);

  // "한자 → 읽기·뜻" 상태
  const [readingChars, setReadingChars] = useState<string[]>([]);
  const [readingScript, setReadingScript] = useState<KanaInputMode>('hiragana');
  const [meaningAnswer, setMeaningAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [recallResult, setRecallResult] = useState<WordRecallGradeResult | null>(null);

  const enteredText = enteredChars.join('');
  const readingText = readingChars.join('');
  // 한자 표기가 없는 단어(たくさん 등)는 "뜻·읽기 → 한자" 방향에서 쓸 한자가 아예 없으므로,
  // 이럴 땐 대신 읽기(히라가나)를 답으로 쓰게 한다.
  const wordHasKanji = word !== null && hasKanji(word);
  const kanjiTarget = word ? (wordHasKanji ? word.kanji : word.reading) : '';
  // 가타카나/영문/숫자/문장부호처럼 필기·히라가나 버튼 어느 쪽으로도 입력할 수 없는 문자와 공백은
  // 채점에서 제외한다 — 그런 문자가 정답에 섞여 있으면 영영 못 맞히게 되는 걸 막기 위함.
  const isKanjiCorrect =
    submitted && !skipped && word !== null && normalizeForMatch(enteredText) === normalizeForMatch(kanjiTarget);

  // 새 단어가 오면 "뜻·읽기 → 한자" 입력 모드를 그 단어에 맞게 맞춰준다 — 한자가 없는 단어면
  // 한자 필기는 애초에 쓸 데가 없으니 히라가나 입력으로 기본값을 바꾼다.
  useEffect(() => {
    if (word) setInputMode(hasKanji(word) ? 'kanji' : 'hiragana');
  }, [word]);

  const resetToKanjiInput = () => {
    setEnteredChars([]);
    setSubmitted(false);
    setSkipped(false);
  };

  const resetToReadingInput = () => {
    setReadingChars([]);
    setReadingScript('hiragana');
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
    const correct = normalizeForMatch(enteredText) === normalizeForMatch(kanjiTarget);
    setSubmitted(true);
    setAnsweredCount((n) => n + 1);
    if (correct) setCorrectCount((n) => n + 1);
    // 단어장-단어별 학습 진도(SRS)에 이번 결과를 반영한다 — 정답은 "보통", 오답은 "다시"로 취급.
    progress.recordReview(word.id, correct ? 'good' : 'again');
  };

  /** 정답을 시도하지 않고 넘긴다 — 오답으로 취급하고, 단어장 학습(안키)에서 최우선으로 다시 나오게 한다. */
  const handleSkipKanji = () => {
    if (!word) return;
    setSubmitted(true);
    setSkipped(true);
    setAnsweredCount((n) => n + 1);
    progress.recordSkip(word.id);
  };

  /** "한자 → 읽기·뜻" 채점 — AI 사용. 한자가 없는 단어는 이미 읽기를 보여준 상태라 뜻만 채점한다. */
  const handleGradeReading = async () => {
    if (!word || !config || !hasRequiredApiKey(config)) return;
    if (wordHasKanji) {
      if (readingText.trim() === '' && meaningAnswer.trim() === '') return;
    } else if (meaningAnswer.trim() === '') {
      return;
    }
    setGrading(true);
    setGradeError(null);
    try {
      // 한자 없는 단어는 읽기를 이미 보여줬으니, 정답 읽기를 그대로 넘겨 그 부분은 항상 통과시킨다.
      const graded = await gradeWordRecall(config, word, wordHasKanji ? readingText.trim() : word.reading, meaningAnswer.trim());
      setRecallResult(graded);
      setAnsweredCount((n) => n + 1);
      const correct = wordHasKanji ? graded.readingCorrect && graded.meaningCorrect : graded.meaningCorrect;
      if (correct) setCorrectCount((n) => n + 1);
      progress.recordReview(word.id, correct ? 'good' : 'again');
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : '채점에 실패했습니다.');
    } finally {
      setGrading(false);
    }
  };

  /** 정답을 시도하지 않고 넘긴다 — AI 채점 없이 바로 오답 처리하고, 안키 학습에서 최우선으로 다시 나오게 한다. */
  const handleSkipReading = () => {
    if (!word) return;
    setAnsweredCount((n) => n + 1);
    progress.recordSkip(word.id);
    setRecallResult({
      readingCorrect: false,
      meaningCorrect: false,
      feedback: '넘어갔어요. 이 단어는 단어장 학습에서 최우선으로 다시 나와요.',
    });
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
                <span className="font-body text-xs text-base-content/50">
                  {wordHasKanji ? '뜻을 보고 한자를 써보세요' : '뜻을 보고 읽기(히라가나)를 써보세요 — 이 단어는 한자가 없어요'}
                </span>
                <p className="font-body text-2xl text-base-content">{word.meaning}</p>
                {/* 한자가 없는 단어는 읽기 자체가 정답이라 여기서 미리 보여주면 답을 그냥 알려주는
                    셈이 되므로 숨긴다 — 한자가 있을 때만 읽기를 힌트로 보여준다. */}
                {wordHasKanji && <p className="font-jp text-base text-base-content/50">{word.reading}</p>}
              </div>

              {/* 한자 입력(필기) 모드에서는 타이핑으로 답을 써버리면 필기 연습 의미가 없어지므로
                  직접 입력을 막는다 — 히라가나/가타카나 입력 모드일 때만 타이핑 허용 */}
              <div className="flex flex-col items-center gap-2">
                <span className="font-body text-xs text-base-content/50">
                  입력한 글자{inputMode !== 'kanji' ? ' — 눌러서 직접 입력도 가능해요' : ''}
                </span>
                <input
                  type="text"
                  value={enteredText}
                  onChange={(e) => setEnteredChars(Array.from(e.target.value))}
                  readOnly={submitted || inputMode === 'kanji'}
                  placeholder={
                    inputMode === 'kanji'
                      ? '아래 캔버스에 한자를 필기해서 채워보세요'
                      : `여기를 눌러 타이핑하거나, 아래 버튼으로 ${inputMode === 'hiragana' ? '히라가나' : '가타카나'}를 입력하세요`
                  }
                  className="font-jp min-h-14 w-64 rounded-[var(--radius-box)] border-2 border-base-300 bg-base-100
                             px-4 py-2 text-center text-2xl text-base-content placeholder:font-body placeholder:text-xs
                             placeholder:text-base-content/30"
                />
                {!submitted && enteredChars.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setEnteredChars((prev) => prev.slice(0, -1))}>
                    마지막 글자 지우기
                  </Button>
                )}
              </div>

              {!submitted && (
                <div className="flex flex-col items-center gap-4">
                  <KanaInputPanel
                    mode={inputMode}
                    onModeChange={setInputMode}
                    onSelect={(c) => setEnteredChars((prev) => [...prev, c])}
                    modes={wordHasKanji ? undefined : ['hiragana', 'katakana']}
                  />

                  <div className="flex gap-2">
                    <Button variant="primary" onClick={handleSubmitKanji} disabled={enteredChars.length === 0}>
                      제출
                    </Button>
                    <Button variant="ghost" onClick={handleSkipKanji}>
                      넘기기
                    </Button>
                  </div>
                </div>
              )}

              {submitted && (
                <div className="flex flex-col gap-3">
                  <FeedbackBanner
                    status={isKanjiCorrect ? 'correct' : 'incorrect'}
                    message={
                      isKanjiCorrect
                        ? `정답이에요. 「${wordHasKanji ? `${word.kanji}(${word.reading})` : word.reading}」 — ${word.meaning}`
                        : skipped
                          ? `넘어갔어요. 정답은 「${wordHasKanji ? `${word.kanji}(${word.reading})` : word.reading}」예요. 이 단어는 단어장 학습에서 최우선으로 다시 나와요.`
                          : `아쉬워요, 정답은 「${wordHasKanji ? `${word.kanji}(${word.reading})` : word.reading}」예요. (입력한 답: 「${enteredText}」)`
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
                <span className="font-body text-xs text-base-content/50">
                  {wordHasKanji ? '한자를 보고 읽기와 뜻을 답해보세요' : '읽기를 보고 뜻을 답해보세요 — 이 단어는 한자가 없어요'}
                </span>
                <p className="font-jp text-4xl text-base-content">{wordHasKanji ? word.kanji : word.reading}</p>
              </div>

              {!blockedByMissingApiKey && recallResult === null && (
                <div className="flex flex-col gap-4">
                  {/* 한자가 없는 단어는 위 카드에서 읽기를 이미 보여줬으니, 그걸 다시 받아쓰게
                      하는 건 의미가 없어서 뜻만 물어본다. */}
                  {wordHasKanji && (
                    <div className="flex flex-col items-center gap-2">
                      <span className="font-body text-xs text-base-content/50">읽기 (가나) — 눌러서 직접 입력도 가능해요</span>
                      <input
                        type="text"
                        value={readingText}
                        onChange={(e) => setReadingChars(Array.from(e.target.value))}
                        placeholder="여기를 눌러 타이핑하거나, 아래 버튼으로 입력하세요"
                        className="font-jp min-h-14 w-64 rounded-[var(--radius-box)] border-2 border-base-300 bg-base-100
                                   px-4 py-2 text-center text-2xl text-base-content placeholder:font-body placeholder:text-xs
                                   placeholder:text-base-content/30"
                      />
                      {readingChars.length > 0 && (
                        <Button variant="ghost" size="sm" onClick={() => setReadingChars((prev) => prev.slice(0, -1))}>
                          마지막 글자 지우기
                        </Button>
                      )}

                      <KanaInputPanel
                        mode={readingScript}
                        onModeChange={setReadingScript}
                        onSelect={(c) => setReadingChars((prev) => [...prev, c])}
                        modes={['hiragana', 'katakana']}
                      />
                    </div>
                  )}

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

                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      onClick={() => void handleGradeReading()}
                      disabled={
                        grading ||
                        (wordHasKanji ? readingText.trim() === '' && meaningAnswer.trim() === '' : meaningAnswer.trim() === '')
                      }
                    >
                      {grading ? '채점하는 중...' : '채점하기'}
                    </Button>
                    <Button variant="ghost" onClick={handleSkipReading} disabled={grading}>
                      넘기기
                    </Button>
                  </div>
                </div>
              )}

              {recallResult && (
                <div className="flex flex-col gap-3">
                  <FeedbackBanner
                    status={
                      (wordHasKanji ? recallResult.readingCorrect : true) && recallResult.meaningCorrect
                        ? 'correct'
                        : 'incorrect'
                    }
                    message={recallResult.feedback}
                  />
                  <p className="font-body text-xs text-base-content/50">
                    {wordHasKanji ? `정답 — 읽기: 「${word.reading}」 · 뜻: ${word.meaning}` : `정답 — 뜻: ${word.meaning}`}
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
