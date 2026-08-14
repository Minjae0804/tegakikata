// Anki가 쓰는 방식(SM-2 변형)을 흉내낸 간격 반복(SRS) 스케줄러.
// 카드(단어)마다 "이지팩터(ease)"와 "간격(intervalDays)"을 들고 있다가, 4단계 평가
// (다시/어려움/보통/쉬움)에 따라 다음 간격을 계산한다. Anki의 분 단위 "학습 단계"는 생략하고
// 하루 단위로 단순화했다 — 이 앱은 세션 단위로 몰아서 복습하는 쓰임이라 그걸로 충분하다.
//
// 진도는 항상 Map<wordId, ProgressEntry>로 받는다 — 단어 수가 많아져도 매번 배열을
// 순회/재구성하지 않고 O(1)로 조회하기 위한 색인이다.
import type { ProgressEntry, WordEntry } from '../../types';

export type Rating = 'again' | 'hard' | 'good' | 'easy';

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const EASY_BONUS = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;

interface SrsState {
  ease: number;
  intervalDays: number;
}

/** Anki의 핵심 공식: again은 리셋, hard/good/easy는 이지팩터를 곱해서(easy는 보너스까지) 간격을 늘린다. */
function computeNext(prev: SrsState | undefined, rating: Rating): SrsState {
  const ease = prev?.ease ?? DEFAULT_EASE;
  const interval = prev?.intervalDays ?? 0;

  switch (rating) {
    case 'again':
      return { ease: Math.max(MIN_EASE, ease - 0.2), intervalDays: 1 };
    case 'hard':
      return {
        ease: Math.max(MIN_EASE, ease - 0.15),
        intervalDays: interval <= 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2)),
      };
    case 'good':
      return { ease, intervalDays: interval <= 0 ? 1 : Math.round(interval * ease) };
    case 'easy':
      return {
        ease: ease + 0.15,
        intervalDays: interval <= 0 ? 4 : Math.round(interval * ease * EASY_BONUS),
      };
  }
}

/** 단어 하나를 복습한 결과(다시/어려움/보통/쉬움)를 반영한 다음 ProgressEntry를 계산한다. */
export function nextEntryAfterReview(
  wordId: string,
  prev: ProgressEntry | undefined,
  rating: Rating,
  now: Date = new Date()
): ProgressEntry {
  const { ease, intervalDays } = computeNext(prev, rating);

  return {
    wordId,
    ease,
    intervalDays,
    reps: (prev?.reps ?? 0) + (rating === 'again' ? 0 : 1),
    lapses: (prev?.lapses ?? 0) + (rating === 'again' ? 1 : 0),
    lastReviewedAt: now.toISOString(),
    nextReviewAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
  };
}

/** 버튼에 "다시: <1일" / "보통: 3일" 처럼 미리보기를 보여주기 위한, 상태를 바꾸지 않는 순수 계산. */
export function previewIntervalDays(prev: ProgressEntry | undefined, rating: Rating): number {
  return computeNext(prev, rating).intervalDays;
}

/** 정렬용 점수 — 작을수록 급함. 한 번도 안 푼 단어가 가장 급하게 취급된다. */
function dueScore(word: WordEntry, progress: Map<string, ProgressEntry>): number {
  const entry = progress.get(word.id);
  if (!entry?.nextReviewAt) return -Infinity;
  return new Date(entry.nextReviewAt).getTime();
}

/**
 * 지금 복습해야 할 단어들을 (가장 급한 순서로) 골라 반환한다.
 * includeNotDue가 true면 아직 기한이 안 된 단어까지 전부 포함해서(급한 순 정렬은 유지) 돌려준다 —
 * "오늘 복습할 게 없어도 그냥 계속 볼래요" 케이스용.
 */
export function pickDueWords(
  words: WordEntry[],
  progress: Map<string, ProgressEntry>,
  includeNotDue = false,
  now: Date = new Date()
): WordEntry[] {
  const nowMs = now.getTime();
  const candidates = includeNotDue ? words : words.filter((w) => dueScore(w, progress) <= nowMs);
  return [...candidates].sort((a, b) => dueScore(a, progress) - dueScore(b, progress));
}
