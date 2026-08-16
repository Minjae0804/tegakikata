// Anki가 쓰는 방식(SM-2 변형)을 흉내낸 간격 반복(SRS) 스케줄러.
// 카드(단어)마다 "이지팩터(ease)"와 "간격(intervalMinutes)"을 들고 있다가, 4단계 평가
// (다시/어려움/보통/쉬움)에 따라 다음 간격을 계산한다.
//
// 간격은 항상 "분" 단위로 계산·저장한다 — 예전엔 "일" 단위였는데, 그러면 "다시"처럼 원래
// 짧아야 할 간격도 전부 뭉뚱그려 하루로 표시돼서 체감이 안 됐다.
//
// 진도는 항상 Map<wordId, ProgressEntry>로 받는다 — 단어 수가 많아져도 매번 배열을
// 순회/재구성하지 않고 O(1)로 조회하기 위한 색인이다.
//
// 진도 키(wordId 자리)는 항상 순수 word.id 하나만 쓰지 않는다 — 단어장 맞추기(+빈칸 채우기)는
// "한자 쓰기"와 "읽기·뜻 회상"이 서로 다른 실력이라, skillKey()로 word.id에 스킬을 붙여
// (`${word.id}::kanji` / `${word.id}::reading`) 따로 추적한다. 번역 게임처럼 굳이 스킬을
// 나눌 필요 없는 곳은 그냥 word.id를 키로 쓴다.
import type { ProgressEntry, WordEntry } from '../../types';

export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type Skill = 'kanji' | 'reading';

/** 단어별로 "한자 쓰기"/"읽기·뜻 회상" 진도를 따로 추적하기 위한 진도 맵 키. */
export function skillKey(wordId: string, skill: Skill): string {
  return `${wordId}::${skill}`;
}

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

/**
 * 빈칸 채우기/단어장 맞추기에서 "모르겠어요"를 누르거나 답을 틀렸을 때 쓴다.
 * 오답(again)과 비슷하게 랩스를 늘리고 이지팩터를 깎지만, 다음 복습 시각(nextReviewAt)은
 * 아예 지워버린다 — dueScore()가 이걸 "한 번도 안 푼 단어"보다도 더 급한 최우선 등급으로
 * 취급하므로, 이미 벌어져 있던 다른 단어의 복습 시각과 상관없이 안키 학습에서 맨 앞으로 나온다.
 */
export function nextEntryAfterMiss(
  wordId: string,
  prev: ProgressEntry | undefined,
  now: Date = new Date()
): ProgressEntry {
  return {
    wordId,
    ease: Math.max(MIN_EASE, (prev?.ease ?? DEFAULT_EASE) - 0.2),
    intervalMinutes: 0,
    reps: prev?.reps ?? 0,
    lapses: (prev?.lapses ?? 0) + 1,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: undefined,
  };
}

// dueScore의 "한 번도 안 푼 단어"/"모르겠어요·오답으로 표시된 단어" 등급을 나타내는 점수.
// 실제 nextReviewAt 타임스탬프(항상 1970년 이후의 큰 양수 ms값)보다 항상 작은, 서로 다른 유한값을
// 써야 한다 — 예전엔 둘 다 -Infinity를 썼는데, 그러면 정렬 비교(a - b)가 -Infinity - (-Infinity) =
// NaN이 돼서 "최우선으로 맨 앞에 나온다"가 실제로는 보장되지 않고 셔플된 순서에 그냥 묻혀버렸다.
const MISSED_SCORE = -2; // "모르겠어요"/오답 — 한 번도 안 푼 단어보다도 더 급하게 취급
const NEVER_STUDIED_SCORE = -1;

/**
 * 진도 엔트리 하나의 정렬용 점수 — 작을수록 급함.
 * "모르겠어요"/오답으로 막 표시된 엔트리가 가장 급하고, 그다음이 한 번도 안 푼 것(엔트리 없음),
 * 그다음은 nextReviewAt이 이른(많이 밀린) 순서.
 */
function dueScoreFor(entry: ProgressEntry | undefined): number {
  if (!entry) return NEVER_STUDIED_SCORE;
  if (!entry.nextReviewAt) return MISSED_SCORE;
  return new Date(entry.nextReviewAt).getTime();
}

/** 기본 정렬 기준 — word.id를 그대로 진도 키로 쓰는 곳(번역 게임 등)에서 쓰는 점수. */
function defaultDueScore(word: WordEntry, progress: Map<string, ProgressEntry>): number {
  return dueScoreFor(progress.get(word.id));
}

/** 특정 스킬(한자 쓰기/읽기·뜻 회상) 하나만 기준으로 정렬하고 싶을 때 쓰는 점수 계산기. */
export function dueScoreBySkill(skill: Skill): (word: WordEntry, progress: Map<string, ProgressEntry>) => number {
  return (word, progress) => dueScoreFor(progress.get(skillKey(word.id, skill)));
}

/**
 * 한자 쓰기/읽기·뜻 회상/(스킬 구분 없는 기존 기록) 중 가장 급한 쪽을 기준으로 정렬하는 점수.
 * 단어장 학습(안키)처럼 "이 단어를 어느 실력으로든 복습해야 하는지"를 종합해서 보여줄 때 쓴다.
 */
export function combinedDueScore(word: WordEntry, progress: Map<string, ProgressEntry>): number {
  return Math.min(
    dueScoreFor(progress.get(skillKey(word.id, 'kanji'))),
    dueScoreFor(progress.get(skillKey(word.id, 'reading'))),
    dueScoreFor(progress.get(word.id))
  );
}

/**
 * 지금 복습해야 할 단어들을 (가장 급한 순서로) 골라 반환한다.
 * includeNotDue가 true면 아직 기한이 안 된 단어까지 전부 포함해서(급한 순 정렬은 유지) 돌려준다 —
 * "오늘 복습할 게 없어도 그냥 계속 볼래요" 케이스용.
 * scoreFor로 정렬 기준을 바꿀 수 있다 — 기본은 word.id 그대로, 스킬별로 보려면 dueScoreBySkill()나
 * combinedDueScore를 넘긴다.
 */
export function pickDueWords(
  words: WordEntry[],
  progress: Map<string, ProgressEntry>,
  includeNotDue = false,
  now: Date = new Date(),
  scoreFor: (word: WordEntry, progress: Map<string, ProgressEntry>) => number = defaultDueScore
): WordEntry[] {
  const nowMs = now.getTime();
  const candidates = includeNotDue ? words : words.filter((w) => scoreFor(w, progress) <= nowMs);
  return [...candidates].sort((a, b) => scoreFor(a, progress) - scoreFor(b, progress));
}
