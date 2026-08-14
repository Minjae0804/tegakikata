// Anki가 쓰는 방식(SM-2 변형)을 흉내낸 간격 반복(SRS) 스케줄러.
// 카드(단어)마다 "이지팩터(ease)"와 "간격(intervalMinutes)"을 들고 있다가, 4단계 평가
// (다시/어려움/보통/쉬움)에 따라 다음 간격을 계산한다.
//
// 간격은 항상 "분" 단위로 계산·저장한다 — 예전엔 "일" 단위였는데, 그러면 "다시"처럼 원래
// 짧아야 할 간격도 전부 뭉뚱그려 하루로 표시돼서 체감이 안 됐다. 분 단위로 들고 있고
// formatInterval()이 화면에는 초/분/시간/일 중 읽기 편한 단위로 알아서 바꿔서 보여준다.
//
// 진도는 항상 Map<wordId, ProgressEntry>로 받는다 — 단어 수가 많아져도 매번 배열을
// 순회/재구성하지 않고 O(1)로 조회하기 위한 색인이다.
import type { ProgressEntry, WordEntry } from '../../types';

export type Rating = 'again' | 'hard' | 'good' | 'easy';

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const EASY_BONUS = 1.3;
const MINUTE_MS = 60 * 1000;
const HOUR_MINUTES = 60;
const DAY_MINUTES = 24 * HOUR_MINUTES;

interface SrsState {
  ease: number;
  intervalMinutes: number;
}

/**
 * Anki의 핵심 공식: again은 항상 짧은 재학습 간격으로, hard/good/easy는 이지팩터를 곱해서
 * (easy는 보너스까지) 간격을 늘린다.
 *
 * 처음 보는 단어(간격이 아직 없음)는 곱셈 공식을 쓸 "이전 간격"이 없어서, 등급별로 서로 다른
 * 시작 간격을 명시적으로 준다 — again=10분, hard=30분(둘 다 Anki의 "학습 단계"처럼 짧게),
 * good=1일, easy=4일(여기서부터 "졸업"해서 날짜 단위 간격을 쓰기 시작).
 */
function computeNext(prev: SrsState | undefined, rating: Rating): SrsState {
  const ease = prev?.ease ?? DEFAULT_EASE;
  const interval = prev?.intervalMinutes ?? 0;
  const isNew = interval <= 0;

  switch (rating) {
    case 'again':
      // 틀렸으니 늘 짧은 재학습 간격으로 — 이전에 얼마나 길게 벌어져 있었든 상관없이 리셋.
      return { ease: Math.max(MIN_EASE, ease - 0.2), intervalMinutes: 10 };
    case 'hard':
      return {
        ease: Math.max(MIN_EASE, ease - 0.15),
        intervalMinutes: isNew ? 30 : Math.max(interval + DAY_MINUTES, Math.round(interval * 1.2)),
      };
    case 'good':
      return { ease, intervalMinutes: isNew ? DAY_MINUTES : Math.round(interval * ease) };
    case 'easy':
      return {
        ease: ease + 0.15,
        intervalMinutes: isNew ? DAY_MINUTES * 4 : Math.round(interval * ease * EASY_BONUS),
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
  const { ease, intervalMinutes } = computeNext(prev, rating);

  return {
    wordId,
    ease,
    intervalMinutes,
    reps: (prev?.reps ?? 0) + (rating === 'again' ? 0 : 1),
    lapses: (prev?.lapses ?? 0) + (rating === 'again' ? 1 : 0),
    lastReviewedAt: now.toISOString(),
    nextReviewAt: new Date(now.getTime() + intervalMinutes * MINUTE_MS).toISOString(),
  };
}

/** 버튼에 "다시: 10분" / "보통: 3일" 처럼 미리보기를 보여주기 위한, 상태를 바꾸지 않는 순수 계산. */
export function previewInterval(prev: ProgressEntry | undefined, rating: Rating): number {
  return computeNext(prev, rating).intervalMinutes;
}

/** 분 단위 간격을 초/분/시간/일 중 가장 읽기 편한 단위로 바꿔서 보여준다. */
export function formatInterval(minutes: number): string {
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))}초`;
  if (minutes < HOUR_MINUTES) return `${Math.round(minutes)}분`;
  if (minutes < DAY_MINUTES) return `${Math.round(minutes / HOUR_MINUTES)}시간`;
  return `${Math.round(minutes / DAY_MINUTES)}일`;
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
