// saves/progress.json(단어장 단어별 학습 진도 — SRS) 로드/캐싱/갱신 훅.
// 온보딩 때 드라이브에 { w: {} } 형태로 기본 생성돼 있다 (driveClient.ts 참고).
//
// 성능 관련 설계:
// - 진도는 Map<wordId, ProgressEntry>로 색인해서 들고 있는다 — 단어 수가 많아져도 조회/갱신이 O(1).
// - 드라이브는 매 답변마다 쓰지 않는다. recordReview는 로컬 상태 + localStorage 캐시만 즉시 갱신하고
//   (그래서 UI는 기다릴 필요가 없다), 실제 드라이브 저장은 세션이 끝날 때(페이지를 벗어날 때) 한 번에
//   모아서 반영한다 — Drive API 왕복(검색+갱신)이 매번 드는 지연을 없애기 위함.
// - 저장 포맷도 압축한다: 필드명을 축약하고(StoredProgressEntry), pretty-print 없이 컴팩트 JSON으로 쓴다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProgressEntry, ProgressStore, StoredProgressEntry } from '../types';
import { readAppFile, writeAppFile } from '../lib/drive/driveClient';
import { getCached, setCached } from '../lib/storage/localCache';
import { nextEntryAfterReview, nextEntryAfterMiss, type Rating } from '../lib/srs/schedule';

const CACHE_KEY = 'progress';
const PROGRESS_PATH = 'saves/progress.json';

function toStoredEntry(e: ProgressEntry): StoredProgressEntry {
  return { e: e.ease, iv: e.intervalMinutes, r: e.reps, la: e.lapses, l: e.lastReviewedAt, n: e.nextReviewAt };
}

function fromStoredEntry(wordId: string, s: StoredProgressEntry): ProgressEntry {
  return {
    wordId,
    ease: s.e,
    intervalMinutes: s.iv,
    reps: s.r,
    lapses: s.la,
    lastReviewedAt: s.l,
    nextReviewAt: s.n,
  };
}

function toMap(store: ProgressStore | null | undefined): Map<string, ProgressEntry> {
  return new Map(Object.entries(store?.w ?? {}).map(([id, s]) => [id, fromStoredEntry(id, s)]));
}

function toStore(map: Map<string, ProgressEntry>): ProgressStore {
  const w: Record<string, StoredProgressEntry> = {};
  for (const [id, e] of map) w[id] = toStoredEntry(e);
  return { w };
}

/** enabled가 false면 자동 로드를 건너뛴다 (Drive 인증 전에는 호출하면 에러가 나므로). */
export function useProgress(enabled = true) {
  const [entries, setEntries] = useState<Map<string, ProgressEntry>>(() =>
    toMap(getCached<ProgressStore>(CACHE_KEY))
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // recordReview는 답변마다 호출되지만 드라이브 쓰기는 flush에서만 일어난다.
  // 최신 상태를 참조하려고 ref도 같이 들고 있는다(언마운트 시점엔 state를 새로 못 읽으므로).
  const latestRef = useRef(entries);
  const dirtyRef = useRef(false);
  useEffect(() => {
    latestRef.current = entries;
  }, [entries]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const store = await readAppFile<ProgressStore>(PROGRESS_PATH);
      const map = toMap(store);
      setEntries(map);
      setCached(CACHE_KEY, store);
    } catch (e) {
      setError(e instanceof Error ? e.message : '학습 진도를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  /** 지금까지 쌓인 진도를 드라이브에 한 번에 반영한다. */
  const flush = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaving(true);
    setError(null);
    try {
      // 컴팩트 JSON(들여쓰기 없음)으로 직접 문자열을 만들어 넘긴다 — writeAppFile은 문자열을
      // 받으면 그대로 쓰므로, 이 파일만 pretty-print 없이 저장돼 페이로드가 줄어든다.
      await writeAppFile(PROGRESS_PATH, JSON.stringify(toStore(latestRef.current)));
    } catch (e) {
      dirtyRef.current = true; // 실패했으면 다음 flush 때 다시 시도하도록 되돌려놓는다
      setError(e instanceof Error ? e.message : '학습 진도를 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * 단어 하나를 복습한 결과(다시/어려움/보통/쉬움 — Anki 방식)를 로컬에 즉시 반영한다
   * (드라이브 저장은 나중에 flush에서 한 번에).
   */
  const recordReview = useCallback((wordId: string, rating: Rating): ProgressEntry => {
    let nextEntry!: ProgressEntry;
    setEntries((prev) => {
      nextEntry = nextEntryAfterReview(wordId, prev.get(wordId), rating);
      const next = new Map(prev);
      next.set(wordId, nextEntry);
      setCached(CACHE_KEY, toStore(next));
      return next;
    });
    dirtyRef.current = true;
    return nextEntry;
  }, []);

  /**
   * 빈칸 채우기/단어장 맞추기에서 "모르겠어요"를 누르거나 답을 틀렸을 때 로컬에 즉시 반영한다 —
   * 다음 복습 시각을 아예 지워서 안키 학습에서 최우선(한 번도 안 푼 단어보다도 급하게)으로
   * 다시 잡히게 한다.
   */
  const recordMiss = useCallback((wordId: string): ProgressEntry => {
    let nextEntry!: ProgressEntry;
    setEntries((prev) => {
      nextEntry = nextEntryAfterMiss(wordId, prev.get(wordId));
      const next = new Map(prev);
      next.set(wordId, nextEntry);
      setCached(CACHE_KEY, toStore(next));
      return next;
    });
    dirtyRef.current = true;
    return nextEntry;
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  // 이 훅을 쓰는 화면을 벗어날 때(언마운트) 밀린 진도를 한 번에 저장한다.
  useEffect(() => {
    return () => {
      if (dirtyRef.current) void writeAppFile(PROGRESS_PATH, JSON.stringify(toStore(latestRef.current))).catch(() => {});
    };
  }, []);

  return { entries, loading, saving, error, refresh, recordReview, recordMiss, flush };
}

/** 게임 페이지들이 props로 받아 쓰는 useProgress()의 반환 타입. */
export type ProgressController = ReturnType<typeof useProgress>;
