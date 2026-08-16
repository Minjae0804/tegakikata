// 단어장 맞추기 게임: 빈칸 채우기/번역과 달리 AI가 문제를 지어내지 않고, 사용자가 고른
// 단어장(useWordBank)에 있는 단어만으로 출제한다. 두 방향을 지원한다.
//  - "뜻·읽기 → 한자": 뜻과 읽기를 보고 한자를 필기로 쓴다. AI 미사용 — 단어장 데이터와
//    글자 그대로 비교해서 채점한다.
//  - "한자 → 읽기·뜻": 한자만 보고 읽기(히라가나)와 뜻(한국어)을 답한다. AI 채점은 토글이다 —
//    켜면 오탈자/동의어까지 유연하게 봐주는 AI(Gemini/Claude) 채점, 끄면(또는 AI 키가 없으면)
//    단어장 데이터와 정확히 일치하는지만 보는 로컬 채점.
//
// 출제 순서는 단어장 학습(안키)과 동일하게 우선순위(SRS) 기반이다 — pickDueWords()로 급한
// 단어부터 정렬한 큐를 만들어 순서대로 보여준다. 맞히면 그 단어는 큐에서 빠지고(다음 복습
// 시각이 늘어나 우선도가 자연히 낮아짐), 틀리거나 "모르겠어요"를 누르면 몇 문제 뒤에 다시
// 나오도록 큐 중간에 끼워넣는다(안키 학습 페이지의 "다시" 재큐잉과 동일한 방식).
//
// "한자 쓰기"와 "읽기·뜻 회상"은 서로 다른 실력이라 진도도 따로 추적한다(skillKey) —
// 한자를 잘 쓴다고 읽기·뜻까지 잘 안다는 보장이 없고 거꾸로도 마찬가지라서. 그래서 출제 큐도
// 방향(direction)이 바뀌면 그 방향의 스킬 기준으로 다시 짠다(dueScoreBySkill).
//
// "AI 활용형 출제"(옵션, AI 키 필요): 켜면 사전형(word) 그대로 내지 않고, AI가 grammar/ 폴더에서
// 고른 문법 노트를 참고해서 자연스러운 활용/파생형을 하나 만들어(飲む→飲みすぎる, 食べる→食べたい
// 등) 그걸로 문제를 낸다. 두 방향 모두에서 동작한다 — 화면 표시/채점 대상만 활용형(displayWord)으로
// 바뀌고, 학습 진도(SRS)는 그대로 원래 단어(word.id) 기준으로 쌓인다(활용형은 매번 새로 만들어지는
// 임시 문제라 그 자체를 단어처럼 따로 추적하지 않는다). 매번 활용형만 나오면 사전형을 익힐 기회가
// 없으므로 VARIATION_SKIP_RATE 확률로는 활용 없이 사전형 그대로 낸다. "뜻·읽기 → 한자" 방향의
// 읽기 힌트는 활용형이 켜져 있어도 항상 사전형 읽기(word.reading)만 보여준다 — 활용된 읽기를
// 그대로 보여주면 활용 패턴 자체가 다 드러나서(예: のみすぎる) 정답을 알려주는 셈이라서다.
import { useEffect, useMemo, useState } from 'react';
import { KanaInputPanel, type KanaInputMode } from '../components/game/fill-blank/KanaInputPanel';
import { FeedbackBanner } from '../components/common/FeedbackBanner';
import { ProgressStat } from '../components/common/ProgressStat';
import { Button } from '../components/common/Button';
import { WordCard } from '../components/common/WordCard';
import { useAppConfig } from '../hooks/useAppConfig';
import type { WordBankController } from '../hooks/useWordBank';
import type { ProgressController } from '../hooks/useProgress';
import { useGrammarBank } from '../hooks/useGrammarBank';
import { WordBankPicker } from '../components/wordbank/WordBankPicker';
import { GrammarPicker } from '../components/grammar/GrammarPicker';
import { gradeWordRecall, generateWordVariation, hasRequiredApiKey } from '../lib/ai/aiClient';
import { shuffle } from '../lib/wordbank/shuffle';
import { pickDueWords, dueScoreBySkill, skillKey } from '../lib/srs/schedule';
import { normalizeForMatch } from '../lib/kana/answerMatch';
import { hasKanji } from '../lib/wordbank/hasKanji';
import type { WordEntry, WordRecallGradeResult, WordVariation } from '../types';

interface WordBankGamePageProps {
  progress: ProgressController;
  wordBank: WordBankController;
  onExit?: () => void;
}

type Direction = 'toKanji' | 'toReading';

// "AI 활용형 출제"가 켜져 있어도 매번 활용형만 나오면 사전형 자체를 익힐 기회가 없으므로,
// 이 확률만큼은 활용 없이 사전형 그대로 낸다.
const VARIATION_SKIP_RATE = 0.3;

export function WordBankGamePage({ progress, wordBank, onExit }: WordBankGamePageProps) {
  const { config } = useAppConfig(true);
  const grammarBank = useGrammarBank(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [grammarPickerOpen, setGrammarPickerOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>('toKanji');
  // 지금 방향이 채점하는 스킬 — 진도 키(skillKey)와 출제 큐 정렬 기준 둘 다 이걸 쓴다.
  const currentSkill = direction === 'toKanji' ? 'kanji' : 'reading';

  // "한자 → 읽기·뜻"의 AI 채점은 이제 토글이다 — AI 키가 없으면 강제로 꺼진 채로 고정된다.
  const aiAvailable = hasRequiredApiKey(config);
  const [useAiGrading, setUseAiGrading] = useState(true);

  // "AI 활용형 출제" — 기본은 꺼짐(문제마다 AI 호출이 추가로 드는 기능이라 명시적으로 켜게 함).
  // AI 키가 없으면 강제로 꺼진 채로 고정된다(채점 토글과 동일한 패턴).
  const [useAiVariation, setUseAiVariation] = useState(false);
  const effectiveUseVariation = aiAvailable && useAiVariation;
  // wordId를 같이 들고 있는 이유: word가 바뀌는 순간(다음 문제로 넘어갈 때) 렌더와 useEffect 사이에
  // 한 프레임 정도 "새 단어 + 이전 활용형"이 섞인 상태로 렌더될 수 있는데, wordId가 안 맞으면
  // displayWord 계산에서 무시하고 원래 단어로 자연스럽게 폴백하게 하기 위함.
  const [variation, setVariation] = useState<{ wordId: string; data: WordVariation } | null>(null);
  const [variationLoading, setVariationLoading] = useState(false);
  const [variationError, setVariationError] = useState<string | null>(null);

  // 우선순위(SRS) 순으로 정렬된 출제 큐. 단어장/진도 로딩이 끝나거나 방향(=스킬)이 바뀌면
  // (다시) 짠다 — progress.entries 자체는 의존성에 안 넣는다(안키 학습 페이지와 동일한 이유:
  // 채점마다 큐가 재구성되는 걸 막기 위해).
  const [queue, setQueue] = useState<WordEntry[]>([]);
  // 방금 답한 결과 — "다음 문제"를 누를 때 큐를 어떻게 진행시킬지(빼기 vs 뒤로 재큐잉) 결정한다.
  const [lastOutcome, setLastOutcome] = useState<'correct' | 'missed' | null>(null);

  useEffect(() => {
    if (wordBank.wordsLoading || progress.loading) return;
    setQueue(pickDueWords(shuffle(wordBank.words), progress.entries, true, new Date(), dueScoreBySkill(currentSkill)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordBank.words, wordBank.wordsLoading, progress.loading, currentSkill]);

  const word = queue[0] ?? null;

  // 문제가 바뀔 때마다("AI 활용형 출제"가 켜져 있으면) AI로 활용형을 새로 하나 만든다. 꺼져 있으면
  // 그냥 사전형(word)을 그대로 쓴다 — displayWord 계산부에서 처리.
  useEffect(() => {
    if (!effectiveUseVariation || !word || !config) {
      setVariation(null);
      return;
    }
    // 활용형만 계속 나오면 사전형 자체를 외울 기회가 줄어드니, 일정 확률로는 활용 없이 사전형
    // 그대로 낸다(그만큼 AI 호출도 아낀다). 문제(word)가 바뀔 때마다 새로 판단한다.
    if (Math.random() < VARIATION_SKIP_RATE) {
      setVariation(null);
      setVariationError(null);
      return;
    }
    let cancelled = false;
    setVariationLoading(true);
    setVariationError(null);
    generateWordVariation(config, word, grammarBank.notes)
      .then((v) => {
        if (!cancelled) setVariation({ wordId: word.id, data: v });
      })
      .catch((e: unknown) => {
        if (!cancelled) setVariationError(e instanceof Error ? e.message : '활용형을 만들지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setVariationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [word, effectiveUseVariation, config, grammarBank.notes]);

  // 실제로 화면에 보여주고 채점 기준으로 삼는 단어 — 활용형이 켜져 있고 정상적으로 만들어졌으면
  // 그 활용형을, 아니면(꺼져 있거나 아직 로딩 중/실패) 원래 단어를 그대로 쓴다. id/bankName은
  // word 그대로 유지한다 — 학습 진도는 항상 원래 단어 기준으로 기록해야 하기 때문(활용형 자체는
  // 진도 추적 대상이 아니다). useMemo로 감싸서 매 렌더 새 객체가 만들어지는 걸 막는다 — 안 그러면
  // 이 값을 deps로 쓰는 아래 useEffect(입력 모드 초기화)가 렌더될 때마다 다시 실행돼버린다.
  const displayWord: WordEntry | null = useMemo(
    () =>
      word && effectiveUseVariation && variation && variation.wordId === word.id
        ? { ...word, kanji: variation.data.kanji, reading: variation.data.reading, meaning: variation.data.meaning }
        : word,
    [word, effectiveUseVariation, variation]
  );

  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);

  // "뜻·읽기 → 한자" 상태
  const [enteredChars, setEnteredChars] = useState<string[]>([]);
  const [inputMode, setInputMode] = useState<KanaInputMode>('kanji');
  const [submitted, setSubmitted] = useState(false);
  // "모르겠어요"로 정답 시도 없이 넘긴 경우 — submitted와 별개로, 오답 취급하되 메시지를 다르게 보여준다.
  const [dontKnow, setDontKnow] = useState(false);

  // "한자 → 읽기·뜻" 상태
  const [readingChars, setReadingChars] = useState<string[]>([]);
  const [readingScript, setReadingScript] = useState<KanaInputMode>('hiragana');
  const [meaningAnswer, setMeaningAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [recallResult, setRecallResult] = useState<WordRecallGradeResult | null>(null);

  const enteredText = enteredChars.join('');
  const readingText = readingChars.join('');
  // 채점/표시 기준은 displayWord(활용형이 켜져 있으면 활용형, 아니면 원래 단어) — 한자 표기가
  // 없으면(たくさん 등, 또는 활용형이어도 한자 없는 원래 단어에서 왔으면) "뜻·읽기 → 한자"
  // 방향에서 쓸 한자가 아예 없으므로, 이럴 땐 대신 읽기(히라가나)를 답으로 쓰게 한다.
  const wordHasKanji = displayWord !== null && hasKanji(displayWord);
  const kanjiTarget = displayWord ? (wordHasKanji ? displayWord.kanji : displayWord.reading) : '';
  // 가타카나/영문/숫자/문장부호처럼 필기·히라가나 버튼 어느 쪽으로도 입력할 수 없는 문자와 공백은
  // 채점에서 제외한다 — 그런 문자가 정답에 섞여 있으면 영영 못 맞히게 되는 걸 막기 위함.
  const isKanjiCorrect =
    submitted && !dontKnow && displayWord !== null && normalizeForMatch(enteredText) === normalizeForMatch(kanjiTarget);
  // AI 키가 없으면(aiAvailable=false) 토글과 상관없이 항상 꺼진다.
  const effectiveUseAi = aiAvailable && useAiGrading;

  // 새 문제가 뜨면 "뜻·읽기 → 한자" 입력 모드를 그 문제에 맞게 맞춰준다 — 한자가 없으면
  // 한자 필기는 애초에 쓸 데가 없으니 히라가나 입력으로 기본값을 바꾼다.
  useEffect(() => {
    if (displayWord) setInputMode(hasKanji(displayWord) ? 'kanji' : 'hiragana');
  }, [displayWord]);

  const resetToKanjiInput = () => {
    setEnteredChars([]);
    setSubmitted(false);
    setDontKnow(false);
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
    setLastOutcome(null);
    resetToKanjiInput();
    resetToReadingInput();
  };

  /** 다음 문제로 넘어간다 — 방금 결과(lastOutcome)에 따라 큐를 진행시킨다(안키와 동일한 재큐잉 방식). */
  const handleNext = () => {
    setQueue((prev) => {
      const current = prev[0];
      const rest = prev.slice(1);
      if (lastOutcome === 'missed' && current) {
        // 틀렸거나 "모르겠어요"였던 단어는 몇 문제 뒤에 다시 나오도록 큐 중간에 끼워넣는다.
        const insertAt = Math.min(rest.length, 3);
        return [...rest.slice(0, insertAt), current, ...rest.slice(insertAt)];
      }
      if (rest.length === 0) {
        // 큐를 다 돌았으면(전부 맞혔으면) 최신 진도로 다시 짜서 계속 이어간다 — 이 게임은
        // 안키 학습과 달리 "세션 종료" 없이 계속 도는 게임이라서.
        return pickDueWords(shuffle(wordBank.words), progress.entries, true, new Date(), dueScoreBySkill(currentSkill));
      }
      return rest;
    });
    setLastOutcome(null);
    resetToKanjiInput();
    resetToReadingInput();
  };

  /** "뜻·읽기 → 한자" 채점 — AI 미사용, 단어장 데이터와 문자열 그대로 비교. */
  const handleSubmitKanji = () => {
    if (enteredChars.length === 0 || !word) return;
    const correct = normalizeForMatch(enteredText) === normalizeForMatch(kanjiTarget);
    setSubmitted(true);
    setAnsweredCount((n) => n + 1);
    setLastOutcome(correct ? 'correct' : 'missed');
    // 단어장-단어별 학습 진도(SRS)에 이번 결과를 반영한다 — 정답은 "보통", 틀렸을 땐 "모르겠어요"와
    // 동일하게 최우선으로 다시 나오게 한다.
    if (correct) {
      setCorrectCount((n) => n + 1);
      progress.recordReview(skillKey(word.id, 'kanji'), 'good');
    } else {
      progress.recordMiss(skillKey(word.id, 'kanji'));
    }
  };

  /** 정답을 시도하지 않고 "모르겠어요"로 넘긴다 — 오답과 동일하게 단어장 학습(안키)에서 최우선으로 다시 나오게 한다. */
  const handleDontKnowKanji = () => {
    if (!word) return;
    setSubmitted(true);
    setDontKnow(true);
    setAnsweredCount((n) => n + 1);
    setLastOutcome('missed');
    progress.recordMiss(skillKey(word.id, 'kanji'));
  };

  /** "한자 → 읽기·뜻" 채점 — AI 사용. 한자가 없는 단어는 이미 읽기를 보여준 상태라 뜻만 채점한다. */
  const handleGradeReading = async () => {
    if (!word || !displayWord || !config || !hasRequiredApiKey(config)) return;
    if (wordHasKanji) {
      if (readingText.trim() === '' && meaningAnswer.trim() === '') return;
    } else if (meaningAnswer.trim() === '') {
      return;
    }
    setGrading(true);
    setGradeError(null);
    try {
      // 한자 없는 단어는 읽기를 이미 보여줬으니, 정답 읽기를 그대로 넘겨 그 부분은 항상 통과시킨다.
      // displayWord를 채점 기준으로 넘긴다 — 활용형이 켜져 있으면 활용형 기준으로 채점된다.
      const graded = await gradeWordRecall(
        config,
        displayWord,
        wordHasKanji ? readingText.trim() : displayWord.reading,
        meaningAnswer.trim()
      );
      setRecallResult(graded);
      setAnsweredCount((n) => n + 1);
      const correct = wordHasKanji ? graded.readingCorrect && graded.meaningCorrect : graded.meaningCorrect;
      setLastOutcome(correct ? 'correct' : 'missed');
      if (correct) {
        setCorrectCount((n) => n + 1);
        progress.recordReview(skillKey(word.id, 'reading'), 'good');
      } else {
        // 틀렸을 때도 "모르겠어요"와 동일하게 최우선으로 다시 나오게 한다.
        progress.recordMiss(skillKey(word.id, 'reading'));
      }
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : '채점에 실패했습니다.');
    } finally {
      setGrading(false);
    }
  };

  /**
   * "한자 → 읽기·뜻" 채점 — AI 미사용, 단어장 데이터와 정확히 일치하는지만 본다(오탈자/동의어는
   * 못 봐주지만, 그 대신 AI 없이도 객관적으로 채점할 수 있다). 한자 없는 단어는 읽기가 이미
   * 프롬프트로 나와 있으니 뜻만 채점한다.
   */
  const handleGradeReadingLocal = () => {
    if (!word || !displayWord) return;
    if (wordHasKanji && readingText.trim() === '') return;
    if (meaningAnswer.trim() === '') return;
    const readingCorrect = wordHasKanji
      ? normalizeForMatch(readingText) === normalizeForMatch(displayWord.reading)
      : true;
    const meaningCorrect = meaningAnswer.trim() === displayWord.meaning.trim();
    const correct = readingCorrect && meaningCorrect;
    setAnsweredCount((n) => n + 1);
    setLastOutcome(correct ? 'correct' : 'missed');
    if (correct) {
      setCorrectCount((n) => n + 1);
      progress.recordReview(skillKey(word.id, 'reading'), 'good');
    } else {
      progress.recordMiss(skillKey(word.id, 'reading'));
    }
    setRecallResult({
      readingCorrect,
      meaningCorrect,
      feedback: correct ? '정답이에요!' : '아쉬워요, 정답을 확인해보세요.',
    });
  };

  /** 정답을 시도하지 않고 "모르겠어요"로 넘긴다 — AI 채점 없이 바로 오답 처리하고, 안키 학습에서 최우선으로 다시 나오게 한다. */
  const handleDontKnowReading = () => {
    if (!word) return;
    setAnsweredCount((n) => n + 1);
    setLastOutcome('missed');
    progress.recordMiss(skillKey(word.id, 'reading'));
    setRecallResult({
      readingCorrect: false,
      meaningCorrect: false,
      feedback: '모르겠다고 표시했어요. 정답을 확인해보세요.',
    });
  };

  const wordBankEmpty = !wordBank.wordsLoading && wordBank.words.length === 0;

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
          {/* 두 방향의 출제 큐가 스킬별로 따로 정렬돼 있어서(dueScoreBySkill), 방향을 바꾸면 보통
              다른 단어로 넘어간다 — 그래서 아무 때나 자유롭게 전환할 수 있게 열어둔다. */}
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
            한자 → 읽기·뜻
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setPickerOpen((v) => !v)}>
          {pickerOpen ? '단어장 선택 닫기' : '단어장 선택'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setGrammarPickerOpen((v) => !v)}>
          {grammarPickerOpen ? '문법 노트 선택 닫기' : '문법 노트 선택'}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {direction === 'toReading' && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={effectiveUseAi}
              onChange={(e) => setUseAiGrading(e.target.checked)}
              disabled={!aiAvailable}
            />
            <span className="font-body text-xs text-base-content/60">
              AI 채점 사용{!aiAvailable && ' — AI 설정이 없어서 꺼져 있어요 (단어장과 정확히 일치해야 정답으로 채점)'}
            </span>
          </label>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="toggle toggle-sm toggle-primary"
            checked={effectiveUseVariation}
            onChange={(e) => setUseAiVariation(e.target.checked)}
            disabled={!aiAvailable}
          />
          <span className="font-body text-xs text-base-content/60">
            AI 활용형 출제{!aiAvailable && ' — AI 설정이 없어서 꺼져 있어요'}
            {aiAvailable && ' — 사전형 대신 AI가 만든 활용형(飲みすぎる, 食べたい 등)으로 출제해요'}
          </span>
        </label>
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

      {(wordBank.wordsLoading || progress.loading) && (
        <p className="font-body text-sm text-base-content/50">불러오는 중...</p>
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

      {variationLoading && <p className="font-body text-sm text-base-content/50">AI가 활용형을 만드는 중...</p>}
      {variationError && (
        <p className="font-body text-xs text-secondary">
          활용형을 만들지 못했어요: {variationError} (사전형으로 대신 출제할게요)
        </p>
      )}

      {word && displayWord && !wordBank.wordsLoading && !progress.loading && !variationLoading && (
        <>
          {direction === 'toKanji' ? (
            <>
              <div className="flex flex-col items-center gap-1 rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-5">
                <span className="font-body text-xs text-base-content/50">
                  {wordHasKanji ? '뜻을 보고 한자를 써보세요' : '뜻을 보고 읽기(히라가나)를 써보세요 — 이 단어는 한자가 없어요'}
                </span>
                <p className="font-body text-2xl text-base-content">{displayWord.meaning}</p>
                {/* 한자가 없는 단어는 읽기 자체가 정답이라 여기서 미리 보여주면 답을 그냥 알려주는
                    셈이 되므로 숨긴다 — 한자가 있을 때만 읽기를 힌트로 보여준다.
                    활용형이 켜져 있어도 힌트는 활용된 읽기(displayWord.reading)가 아니라 항상
                    원형(사전형, word.reading)만 보여준다 — 활용된 읽기를 그대로 보여주면 활용
                    패턴 자체를 다 알려주는 셈이라(예: のみすぎる → 飲みすぎる는 거의 받아쓰기가
                    돼버림), 원형 읽기 정도만 힌트로 주고 활용은 스스로 하게 한다. */}
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
                    <Button variant="ghost" onClick={handleDontKnowKanji}>
                      모르겠어요
                    </Button>
                  </div>
                </div>
              )}

              {submitted && (
                <div className="flex flex-col items-center gap-3">
                  {/* 정답을 먼저, 크고 또렷하게 — 그 아래에 채점 피드백. */}
                  <WordCard word={displayWord} crosshair={false} size="lg" label="정답" />
                  {effectiveUseVariation && variation && variation.wordId === word.id && (
                    <p className="font-body text-xs text-base-content/50">
                      원형: {hasKanji(word) ? word.kanji : word.reading}({word.meaning})
                      {variation.data.note && ` · ${variation.data.note}`}
                    </p>
                  )}
                  <FeedbackBanner
                    status={isKanjiCorrect ? 'correct' : 'incorrect'}
                    message={
                      isKanjiCorrect
                        ? '정답이에요!'
                        : dontKnow
                          ? '이 단어는 단어장 학습에서 최우선으로 다시 나와요.'
                          : `아쉬워요. (입력한 답: 「${enteredText}」) 이 단어는 단어장 학습에서 최우선으로 다시 나와요.`
                    }
                  />
                  {!isKanjiCorrect && <PracticeWriting key={`${word.id}-toKanji`} word={displayWord} />}
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
                <p className="font-jp text-4xl text-base-content">{wordHasKanji ? displayWord.kanji : displayWord.reading}</p>
              </div>

              {recallResult === null && (
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
                    <span className="font-body text-xs text-base-content/60">
                      뜻 (한국어){!effectiveUseAi && ' — 단어장과 정확히 일치해야 정답으로 처리돼요'}
                    </span>
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
                      onClick={() => (effectiveUseAi ? void handleGradeReading() : handleGradeReadingLocal())}
                      disabled={
                        effectiveUseAi
                          ? grading ||
                            (wordHasKanji ? readingText.trim() === '' && meaningAnswer.trim() === '' : meaningAnswer.trim() === '')
                          : meaningAnswer.trim() === '' || (wordHasKanji && readingText.trim() === '')
                      }
                    >
                      {effectiveUseAi ? (grading ? '채점하는 중...' : '채점하기') : '제출'}
                    </Button>
                    <Button variant="ghost" onClick={handleDontKnowReading} disabled={grading}>
                      모르겠어요
                    </Button>
                  </div>
                </div>
              )}

              {recallResult &&
                (() => {
                  const recallCorrect = (wordHasKanji ? recallResult.readingCorrect : true) && recallResult.meaningCorrect;
                  return (
                    <div className="flex flex-col items-center gap-3">
                      {/* 정답을 먼저, 크고 또렷하게 — 그 아래에 채점 피드백. */}
                      <WordCard word={displayWord} crosshair={false} size="lg" label="정답" />
                      {effectiveUseVariation && variation && word && variation.wordId === word.id && (
                        <p className="font-body text-xs text-base-content/50">
                          원형: {hasKanji(word) ? word.kanji : word.reading}({word.meaning})
                          {variation.data.note && ` · ${variation.data.note}`}
                        </p>
                      )}
                      <FeedbackBanner status={recallCorrect ? 'correct' : 'incorrect'} message={recallResult.feedback} />
                      {!recallCorrect && (
                        <>
                          <p className="font-body text-xs text-base-content/50">
                            이 단어는 단어장 학습에서 최우선으로 다시 나와요.
                          </p>
                          <PracticeWriting key={`${word.id}-toReading`} word={displayWord} />
                        </>
                      )}
                      <Button variant="primary" onClick={handleNext}>
                        다음 문제
                      </Button>
                    </div>
                  );
                })()}
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * 오답이었을 때만 보여주는, 채점하지 않는 손글씨 연습(기본은 접힘) — 주기능이 아니라서 접었다
 * 펼치는 형태로 둔다. WordBankStudyPage의 "손으로 써보기"와 동일한 패턴. 부모 쪽에서 문제가
 * 바뀔 때마다 다른 key를 줘서 이 컴포넌트를 새로 마운트시키므로, 여기서는 별도로 리셋 로직을
 * 두지 않고 useState 초기값만 신경 쓰면 된다.
 */
function PracticeWriting({ word }: { word: WordEntry }) {
  const wordHasKanji = hasKanji(word);
  const [open, setOpen] = useState(false);
  const [inputMode, setInputMode] = useState<KanaInputMode>(wordHasKanji ? 'kanji' : 'hiragana');
  const [chars, setChars] = useState<string[]>([]);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
        {open ? '손으로 써보기 닫기' : '✏️ 이 단어 손으로 써보기'}
      </Button>

      {open && (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-4">
          <div className="flex min-h-11 items-center gap-1 rounded-[var(--radius-field)] border-2 border-base-300 bg-base-100 px-3 py-1.5">
            {chars.length === 0 ? (
              <span className="font-body text-xs text-base-content/30 select-none">
                연습 삼아 「{wordHasKanji ? word.kanji : word.reading}」를 써보세요
              </span>
            ) : (
              chars.map((char, i) => (
                <span key={i} className="font-jp text-xl text-base-content">
                  {char}
                </span>
              ))
            )}
          </div>
          {chars.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setChars([])}>
              연습 지우고 다시
            </Button>
          )}

          <KanaInputPanel
            mode={inputMode}
            onModeChange={setInputMode}
            onSelect={(c) => setChars((prev) => [...prev, c])}
            modes={wordHasKanji ? undefined : ['hiragana', 'katakana']}
          />
        </div>
      )}
    </div>
  );
}
