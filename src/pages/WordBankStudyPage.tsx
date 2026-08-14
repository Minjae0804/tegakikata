// 단어장 학습(자기평가 플래시카드 + Anki 방식 SRS): 단어장 맞추기와 달리 정답을 "맞혀야" 하는 게
// 아니라, 한자를 보여주고 사용자가 스스로 다시/어려움/보통/쉬움 중 하나로 평가해서 복습 간격을
// 조절한다(Anki의 4버튼 평가 + 이지팩터 방식, lib/srs/schedule.ts 참고).
// 결과는 saves/progress.json(useProgress)에 단어별로 저장돼서, 다음에 왔을 때 복습이 급한
// 단어부터 우선 나온다. "다시"를 고른 카드는 이번 세션 안에서 몇 장 뒤에 다시 나온다(Anki와 동일).
import { useEffect, useState } from 'react';
import { ProgressStat } from '../components/common/ProgressStat';
import { Button } from '../components/common/Button';
import { JlptBadge } from '../components/common/JlptBadge';
import { useWordBank } from '../hooks/useWordBank';
import type { ProgressController } from '../hooks/useProgress';
import { WordBankPicker } from '../components/wordbank/WordBankPicker';
import { pickDueWords, previewIntervalDays, type Rating } from '../lib/srs/schedule';
import { shuffle } from '../lib/wordbank/shuffle';
import type { WordEntry } from '../types';

interface WordBankStudyPageProps {
  progress: ProgressController;
  onExit?: () => void;
}

// 두 줄(라벨 + 간격 미리보기)을 보여줘야 해서 공용 Button(한 줄짜리 고정 높이) 대신
// btn 클래스를 직접 써서 높이를 내용에 맞춘다.
const RATING_BUTTONS: { rating: Rating; label: string; btnClass: string }[] = [
  { rating: 'again', label: '다시', btnClass: 'btn-outline btn-primary' },
  { rating: 'hard', label: '어려움', btnClass: 'btn-outline btn-primary' },
  { rating: 'good', label: '보통', btnClass: 'btn-primary' },
  { rating: 'easy', label: '쉬움', btnClass: 'btn-secondary' },
];

export function WordBankStudyPage({ progress, onExit }: WordBankStudyPageProps) {
  const wordBank = useWordBank(true);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [studyAll, setStudyAll] = useState(false);
  const [flipped, setFlipped] = useState(false);

  // 이번 세션에서 풀 카드들. "다시"를 고르면 이 큐 안에서 몇 장 뒤로 다시 끼워넣는다(Anki처럼).
  const [queue, setQueue] = useState<WordEntry[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [initialQueueSize, setInitialQueueSize] = useState(0);

  const [sessionCounts, setSessionCounts] = useState<Record<Rating, number>>({
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });

  // 단어장/모드가 바뀌거나 데이터 로딩이 끝났을 때 한 번 큐를 (다시) 짠다.
  // progress.entries 자체는 의존성에 안 넣는다 — 채점마다 세션 큐가 재구성되는 걸 막기 위해서.
  useEffect(() => {
    if (wordBank.wordsLoading || progress.loading) return;
    // pickDueWords는 급한 정도로 정렬하는데, 안 배운 새 단어끼리는 급한 정도가 다 같아서(무기한
    // 대상) 안 섞으면 CSV 순서 그대로 나온다. 먼저 섞어두면 안정 정렬 특성상 급한 순서는 그대로
    // 지키면서 동급 안에서는 무작위로 나온다.
    const due = pickDueWords(shuffle(wordBank.words), progress.entries, studyAll);
    setQueue(due);
    setInitialQueueSize(due.length);
    setSeeded(true);
    setSessionCounts({ again: 0, hard: 0, good: 0, easy: 0 });
    setFlipped(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordBank.words, wordBank.wordsLoading, progress.loading, studyAll]);

  const word = queue[0] ?? null;
  const currentEntry = word ? progress.entries.get(word.id) : undefined;

  const wordBankEmpty = !wordBank.wordsLoading && wordBank.words.length === 0;
  const nothingDue = seeded && initialQueueSize === 0 && wordBank.words.length > 0;
  const sessionDone = seeded && initialQueueSize > 0 && queue.length === 0;
  const sessionTotal = sessionCounts.again + sessionCounts.hard + sessionCounts.good + sessionCounts.easy;

  const handleFlip = () => setFlipped(true);

  const handleRate = (rating: Rating) => {
    if (!word) return;
    progress.recordReview(word.id, rating); // 로컬 즉시 반영, 드라이브 저장은 나중에 한 번에(useProgress)
    setSessionCounts((prev) => ({ ...prev, [rating]: prev[rating] + 1 }));

    setQueue((prev) => {
      const rest = prev.slice(1);
      if (rating !== 'again') return rest;
      // "다시"는 몇 장 뒤에 다시 나오도록 큐 중간에 끼워넣는다.
      const insertAt = Math.min(rest.length, 3);
      return [...rest.slice(0, insertAt), word, ...rest.slice(insertAt)];
    });
    setFlipped(false);
  };

  const handleStudyAllAnyway = () => {
    setStudyAll(true); // 큐 재구성은 위 useEffect가 studyAll 변화에 반응해서 처리
  };

  const handleRestart = () => {
    const due = pickDueWords(shuffle(wordBank.words), progress.entries, studyAll);
    setQueue(due);
    setInitialQueueSize(due.length);
    setSessionCounts({ again: 0, hard: 0, good: 0, easy: 0 });
    setFlipped(false);
  };

  return (
    <div className="flex flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-body text-xs tracking-[0.3em] text-base-content/40 uppercase">단어장 학습</p>
          <h1 className="font-display text-xl text-base-content">오늘 복습할 단어</h1>
        </div>
        {onExit && (
          <Button variant="ghost" size="sm" onClick={onExit}>
            나가기
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-6">
        <ProgressStat label="이번 세션" value={sessionCounts.good + sessionCounts.easy} suffix={`/${sessionTotal}`} />
        {!sessionDone && queue.length > 0 && (
          <ProgressStat label="남은 카드" value={queue.length} />
        )}
        <Button variant="ghost" size="sm" onClick={() => setPickerOpen((v) => !v)}>
          {pickerOpen ? '단어장 선택 닫기' : '단어장 선택'}
        </Button>
      </div>

      {wordBank.wordsError && (
        <p className="font-body text-xs text-secondary">단어장 로드 실패: {wordBank.wordsError}</p>
      )}
      {progress.error && <p className="font-body text-xs text-secondary">{progress.error}</p>}

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
            setStudyAll(false);
          }}
        />
      )}

      {(wordBank.wordsLoading || progress.loading) && (
        <p className="font-body text-sm text-base-content/50">불러오는 중...</p>
      )}

      {wordBankEmpty && (
        <div className="flex flex-col gap-2">
          <p className="font-body text-sm text-base-content/60">
            학습할 단어장이 없어요. "단어장 선택"에서 CSV를 먼저 골라주세요.
          </p>
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            단어장 선택하기
          </Button>
        </div>
      )}

      {nothingDue && (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-8">
          <p className="font-display text-lg text-base-content">오늘 복습할 단어를 다 봤어요 🎉</p>
          <p className="font-body text-sm text-base-content/60">
            전체 {wordBank.words.length}개 단어 중 지금 당장 복습이 급한 건 없어요.
          </p>
          <Button variant="outline" size="sm" onClick={handleStudyAllAnyway}>
            그래도 전체 단어 복습하기
          </Button>
        </div>
      )}

      {word && !sessionDone && (
        <div className="flex flex-col items-center gap-6">
          <div
            className="flex min-h-56 w-full max-w-sm cursor-pointer flex-col items-center justify-center gap-3
                       rounded-[var(--radius-box)] border-2 border-base-300 bg-base-100 p-8"
            onClick={!flipped ? handleFlip : undefined}
          >
            {word.jlptLevel && (
              <div className="self-end">
                <JlptBadge level={word.jlptLevel} />
              </div>
            )}
            <p className="font-jp text-5xl text-base-content">{word.kanji}</p>

            {flipped ? (
              <div className="flex flex-col items-center gap-1 pt-2">
                <p className="font-jp text-xl text-base-content/80">{word.reading}</p>
                <p className="font-body text-base text-base-content/60">{word.meaning}</p>
              </div>
            ) : (
              <p className="font-body pt-2 text-xs text-base-content/40">탭해서 답 보기</p>
            )}
          </div>

          {flipped && (
            <div className="flex gap-2">
              {RATING_BUTTONS.map(({ rating, label, btnClass }) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => handleRate(rating)}
                  className={`btn h-auto min-h-0 flex-col gap-0.5 rounded-[var(--radius-field)] px-3 py-2 ${btnClass}`}
                >
                  <span className="font-body text-sm">{label}</span>
                  <span className="font-body text-[10px] opacity-70">
                    {previewIntervalDays(currentEntry, rating)}일
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {sessionDone && (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-8">
          <p className="font-display text-lg text-base-content">이번 세션 끝! 🙌</p>
          <p className="font-body text-sm text-base-content/60">
            다시 {sessionCounts.again} · 어려움 {sessionCounts.hard} · 보통 {sessionCounts.good} · 쉬움{' '}
            {sessionCounts.easy}
          </p>
          <Button variant="primary" size="sm" onClick={handleRestart}>
            처음부터 다시
          </Button>
        </div>
      )}
    </div>
  );
}
