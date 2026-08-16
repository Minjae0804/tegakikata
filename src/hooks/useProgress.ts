// 단어장 CSV 자체에 진도 컬럼으로 저장되는 학습 진도(SRS) 로드/캐싱/갱신 훅.
// 예전엔 단어장별로 saves/progress-<단어장 이름>.json이라는 별도 파일에 진도를 저장했는데,
// 이제는 그 단어장의 CSV 파일 자체(kanji_e/iv/r/la/l/n, reading_e/iv/r/la/l/n 컬럼 —
// lib/wordbank/csv.ts 참고)에 같이 저장한다 — 그래서 단어장 CSV 하나가 어휘 목록이자 세이브
// 파일이다. 예전 saves/progress-*.json이 아직 남아있으면 그 단어장을 처음 불러올 때 한 번
// 병합해서 끌어온다(마이그레이션 — 아래 loadBankProgress 참고). 이 훅의 공개 API(entries/
// recordReview/recordMiss/flush 등)는 예전 그대로라 게임 페이지 쪽 코드는 안 바뀐다.
//
// 진도는 "전체 계정" 단위가 아니라 "개별 단어장(CSV 파일)" 단위로 따로 관리한다 — WordEntry.id가
// `${bankName}::...` 형태로 단어장 이름을 포함하고 있어서(lib/wordbank/csv.ts 참고), 이 훅은
// 그 id(혹은 skillKey로 감싼 id)에서 맨 앞 단어장 이름만 꺼내 어느 단어장(파일)에 속하는지 정한다.
//
// 성능 관련 설계:
// - 진도는 Map<progressKey, ProgressEntry>로 색인해서 들고 있는다 — 단어 수가 많아져도 조회/갱신이
//   O(1). 지금 화면에 필요 없는 단어장의 진도까지 미리 다 불러오지 않고, words(지금 로드된 단어들)에
//   새로 등장한 단어장만 그때그때 그 CSV를 읽어와 진도 컬럼만 뽑아서 이 맵에 얹는다.
// - 드라이브는 매 답변마다 쓰지 않는다. recordReview는 로컬 상태 + localStorage 캐시만 즉시 갱신하고
//   (그래서 UI는 기다릴 필요가 없다), 실제 드라이브 저장은 1분마다 자동으로 한 번에 모아서
//   반영한다(+ 화면 이동/언마운트 시점에도 한 번 더) — Drive API 왕복(검색+갱신)이 매번 드는
//   지연을 없애면서도, "나가기를 눌러야만 저장됨" 같은 상황 없이 주기적으로 안전하게 저장한다.
// - CSV를 다시 쓸 때도 어휘는 원격(드라이브의 최신 CSV)을 그대로 신뢰한다 — 그새 사용자가 시트에서
//   직접 단어를 고치거나 추가/삭제했을 수 있어서, 우리는 진도 컬럼만 얹어서 다시 쓴다.
//
// 정합성(여러 세션 동시 사용): 같은 계정으로 브라우저 탭 + 설치한 PWA를 동시에 켜두거나, 폰·PC를
// 동시에 쓰는 경우 세션이 두 개 이상 떠 있을 수 있다. 그냥 로컬 진도를 통째로 덮어쓰면 나중에
// flush한 세션이 먼저 flush한 세션의 갱신분을 지워버린다. 그래서 flush 직전에 드라이브의 최신
// CSV를 다시 읽어와 단어별로 병합한다(mergeProgressMaps) — 단어별 lastReviewedAt이 더 최근인
// 쪽을 채택. 같은 단어를 두 세션에서 동시에 건드린 경우에만(드묾) 더 나중에 답한 쪽이 이긴다 —
// SRS 의미상으로도 "가장 최근에 실제로 푼 결과"가 다음 복습 시각을 결정하는 게 맞다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProgressEntry, ProgressStore, StoredProgressEntry, WordEntry } from '../types';
import { readAppFile, readWordBankFileById, updateWordBankFileById } from '../lib/drive/driveClient';
import { getCached, setCached } from '../lib/storage/localCache';
import { parseWordBankCsv, parseWordBankCsvProgress, serializeWordBankCsv } from '../lib/wordbank/csv';
import { nextEntryAfterReview, nextEntryAfterMiss, type Rating } from '../lib/srs/schedule';

const CACHE_KEY = 'progress';

/** 진도 키(단어 id 자체거나, skillKey로 "::kanji"/"::reading"이 붙은 것)에서 맨 앞 단어장 이름만 뽑는다. */
function bankNameOfKey(key: string): string {
  const idx = key.indexOf('::');
  return idx === -1 ? key : key.slice(0, idx);
}

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

function legacyStoreToMap(store: ProgressStore | null | undefined): Map<string, ProgressEntry> {
  return new Map(Object.entries(store?.w ?? {}).map(([id, s]) => [id, fromStoredEntry(id, s)]));
}

function toCacheStore(map: Map<string, ProgressEntry>): ProgressStore {
  const w: Record<string, StoredProgressEntry> = {};
  for (const [id, e] of map) w[id] = toStoredEntry(e);
  return { w };
}

/** 단어들을 소속 단어장(bankName)별로 묶는다 — 같은 단어장의 단어는 항상 같은 fileId를 공유한다. */
function groupByBank(words: WordEntry[]): Map<string, { fileId: string; words: WordEntry[] }> {
  const groups = new Map<string, { fileId: string; words: WordEntry[] }>();
  for (const w of words) {
    let group = groups.get(w.bankName);
    if (!group) {
      group = { fileId: w.fileId, words: [] };
      groups.set(w.bankName, group);
    }
    group.words.push(w);
  }
  return groups;
}

/**
 * 드라이브에 지금 저장된 두 진도 맵을 단어별로 병합한다. 단어별 lastReviewedAt이 더 최근인 쪽을
 * 채택 — 로컬에서 안 건드린 단어를 다른 세션이 그새 갱신했으면 그 갱신분을 살리고, 로컬에서 방금
 * 건드린 단어는(항상 lastReviewedAt이 지금 시각이라) 로컬이 이긴다.
 */
function mergeProgressMaps(
  remote: Map<string, ProgressEntry>,
  local: Map<string, ProgressEntry>
): Map<string, ProgressEntry> {
  const merged = new Map(remote);
  for (const [id, localEntry] of local) {
    const remoteEntry = remote.get(id);
    if (!remoteEntry) {
      merged.set(id, localEntry);
      continue;
    }
    const localTime = localEntry.lastReviewedAt ? Date.parse(localEntry.lastReviewedAt) : -Infinity;
    const remoteTime = remoteEntry.lastReviewedAt ? Date.parse(remoteEntry.lastReviewedAt) : -Infinity;
    merged.set(id, localTime >= remoteTime ? localEntry : remoteEntry);
  }
  return merged;
}

/**
 * 특정 단어장의 진도를 불러온다 — CSV 진도 컬럼이 기본이고, 예전 saves/progress-<단어장
 * 이름>.json이 아직 남아있으면(마이그레이션 안 된 경우) 그것도 같이 병합해서 끌어온다.
 * 그 예전 파일 자체는 이제 다시 쓰지 않는다 — 다음 flush부터는 CSV 쪽에 반영되고, 예전 파일은
 * 그냥 안 쓰이는 채로 드라이브에 남는다(원하면 사용자가 직접 지워도 됨).
 */
async function loadBankProgress(bankName: string, fileId: string): Promise<Map<string, ProgressEntry>> {
  const csvText = await readWordBankFileById(fileId);
  const fromCsv = parseWordBankCsvProgress(csvText, bankName);
  try {
    const legacy = legacyStoreToMap(await readAppFile<ProgressStore>(`saves/progress-${bankName}.json`));
    return mergeProgressMaps(fromCsv, legacy);
  } catch {
    return fromCsv;
  }
}

/**
 * enabled가 false면 자동 로드를 건너뛴다 (Drive 인증 전에는 호출하면 에러가 나므로).
 * words는 "지금 화면에 로드된 단어들"(useWordBank.words) — 여기 새로 등장한 단어장이 있으면 그
 * 단어장 CSV에서 진도 컬럼만 그때 불러와서 합친다. 매 렌더마다 새 배열을 넘기면 불필요한
 * 재확인이 생기니, 호출하는 쪽(App.tsx)에서 useMemo/state로 안정된 참조를 넘기는 걸 권장한다.
 */
export function useProgress(enabled = true, words: WordEntry[] = []) {
  const [entries, setEntries] = useState<Map<string, ProgressEntry>>(() =>
    legacyStoreToMap(getCached<ProgressStore>(CACHE_KEY))
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // recordReview는 답변마다 호출되지만 드라이브 쓰기는 flush에서만 일어난다.
  // 최신 상태를 참조하려고 ref도 같이 들고 있는다(언마운트 시점엔 state를 새로 못 읽으므로).
  const latestRef = useRef(entries);
  // 이미 진도를 불러온 단어장 이름들 — words에 이미 있는 단어장이면 다시 안 불러온다.
  const loadedBanksRef = useRef<Set<string>>(new Set());
  // 아직 드라이브에 반영 안 된(로컬에서만 바뀐) 단어장 이름들 — flush 때 이것만 골라 저장한다.
  const dirtyBanksRef = useRef<Set<string>>(new Set());
  const wordsRef = useRef(words);
  useEffect(() => {
    latestRef.current = entries;
  }, [entries]);
  useEffect(() => {
    wordsRef.current = words;
  }, [words]);

  /** 지금 로드된 단어들이 속한 단어장을 전부 다시 불러온다(강제 새로고침 — loadedBanksRef 여부와 무관하게). */
  const refresh = useCallback(async () => {
    const groups = groupByBank(wordsRef.current);
    if (groups.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const loadedMaps = await Promise.all(
        Array.from(groups, async ([bank, { fileId }]) => {
          try {
            return await loadBankProgress(bank, fileId);
          } catch {
            return new Map<string, ProgressEntry>();
          }
        })
      );
      for (const bank of groups.keys()) loadedBanksRef.current.add(bank);
      setEntries((prev) => {
        const next = new Map(prev);
        for (const m of loadedMaps) for (const [k, v] of m) next.set(k, v);
        latestRef.current = next;
        setCached(CACHE_KEY, toCacheStore(next));
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '학습 진도를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // words에 아직 안 불러온 단어장이 새로 들어오면(단어장을 새로 고르는 등) 그것만 불러온다.
  useEffect(() => {
    if (!enabled) return;
    const groups = groupByBank(words);
    const toLoad = Array.from(groups).filter(([bank]) => !loadedBanksRef.current.has(bank));
    if (toLoad.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.all(
      toLoad.map(async ([bank, { fileId }]) => {
        try {
          return await loadBankProgress(bank, fileId);
        } catch {
          return new Map<string, ProgressEntry>();
        }
      })
    )
      .then((loadedMaps) => {
        if (cancelled) return;
        for (const [bank] of toLoad) loadedBanksRef.current.add(bank);
        setEntries((prev) => {
          const next = new Map(prev);
          for (const m of loadedMaps) for (const [k, v] of m) next.set(k, v);
          latestRef.current = next;
          setCached(CACHE_KEY, toCacheStore(next));
          return next;
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '학습 진도를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- words는 호출하는 쪽에서 메모이즈해 참조를 넘긴다
  }, [enabled, words]);

  /** 지금까지 쌓인 진도를, 바뀐 단어장들만 골라 드라이브의 최신 CSV와 병합해서 그 CSV에 다시 써넣는다. */
  const flush = useCallback(async () => {
    const dirtyBanks = Array.from(dirtyBanksRef.current);
    if (dirtyBanks.length === 0) return;
    dirtyBanksRef.current.clear();
    setSaving(true);
    setError(null);
    const failedBanks: string[] = [];
    const groups = groupByBank(wordsRef.current);
    for (const bank of dirtyBanks) {
      const group = groups.get(bank);
      if (!group) continue; // 이 단어장이 더 이상 로드돼 있지 않으면(선택 해제 등) 쓸 파일을 모르니 건너뜀
      try {
        const localForBank = new Map(
          Array.from(latestRef.current).filter(([key]) => bankNameOfKey(key) === bank)
        );
        // 어휘는 원격(드라이브의 최신 CSV)을 신뢰하고, 진도만 로컬과 병합한다 — 그새 사용자가
        // 시트에서 단어를 고쳤을 수도 있어서다.
        const remoteText = await readWordBankFileById(group.fileId);
        const remoteWords = parseWordBankCsv(remoteText, bank, group.fileId);
        const remoteProgress = parseWordBankCsvProgress(remoteText, bank);
        const merged = mergeProgressMaps(remoteProgress, localForBank);
        const csvText = serializeWordBankCsv(remoteWords, merged);
        await updateWordBankFileById(group.fileId, csvText);
        // 병합 결과(다른 세션이 그새 갱신한 부분 포함)를 로컬 상태에도 반영한다. 위에서 원격을
        // 읽는 동안(await) 사용자가 바로 다음 문제를 풀어서 latestRef.current가 이미 merged
        // 스냅샷보다 더 앞서 있을 수 있으므로, merged로 그냥 덮어쓰지 않고 "그 사이에 더 최신인
        // 로컬 항목"과 다시 한번 단어별로 합쳐서 반영한다 — 안 그러면 대기 중에 방금 입력한 답이
        // 화면에서 잠깐 사라졌다가 다음 flush에야 돌아오는 것처럼 보인다(이 단어장은 방금
        // dirtyBanksRef에 다시 추가돼 있어 드라이브 저장 자체는 다음 flush 때 정상적으로 이어진다).
        setEntries((current) => {
          const combined = new Map(current);
          for (const [id, mergedEntry] of merged) {
            const currentEntry = combined.get(id);
            if (!currentEntry) {
              combined.set(id, mergedEntry);
              continue;
            }
            const currentTime = currentEntry.lastReviewedAt ? Date.parse(currentEntry.lastReviewedAt) : -Infinity;
            const mergedTime = mergedEntry.lastReviewedAt ? Date.parse(mergedEntry.lastReviewedAt) : -Infinity;
            combined.set(id, currentTime >= mergedTime ? currentEntry : mergedEntry);
          }
          latestRef.current = combined;
          setCached(CACHE_KEY, toCacheStore(combined));
          return combined;
        });
      } catch {
        failedBanks.push(bank); // 이 단어장만 실패 — 다른 단어장 저장은 그대로 진행한다
      }
    }
    if (failedBanks.length > 0) {
      for (const bank of failedBanks) dirtyBanksRef.current.add(bank); // 다음 flush 때 다시 시도
      setError('일부 단어장의 학습 진도를 저장하지 못했습니다.');
    }
    setSaving(false);
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
      setCached(CACHE_KEY, toCacheStore(next));
      return next;
    });
    dirtyBanksRef.current.add(bankNameOfKey(wordId));
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
      setCached(CACHE_KEY, toCacheStore(next));
      return next;
    });
    dirtyBanksRef.current.add(bankNameOfKey(wordId));
    return nextEntry;
  }, []);

  // 저장 기준은 "나갈 때"가 아니라 1분마다 — 화면을 안 벗어나고 오래 머물러도 주기적으로
  // 안전하게 반영되게 한다. 바뀐 단어장이 없으면 flush() 안에서 바로 반환하니 매분 불필요한
  // 쓰기가 나가진 않는다.
  useEffect(() => {
    if (!enabled) return;
    const intervalId = setInterval(() => {
      void flush();
    }, 60 * 1000);
    return () => clearInterval(intervalId);
  }, [enabled, flush]);

  // 이 훅을 쓰는 화면을 벗어날 때(언마운트) 밀린 진도를 한 번에 저장한다. flush()와 동일하게
  // 단어장 CSV 최신 내용과 병합 후 다시 써넣는다 — 여기서는 언마운트 이후라 로컬 state는 못
  // 되돌리지만, 어차피 다음 마운트 때 다시 읽어오므로 문제없다.
  useEffect(() => {
    return () => {
      const groups = groupByBank(wordsRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 언마운트 시점의 최신 값을 읽는다(ref가 DOM 노드가 아니라 누적되는 Set/Map이라, 마운트 시점 스냅샷을 복사해두면 오히려 틀린 값이 된다)
      for (const bank of dirtyBanksRef.current) {
        const group = groups.get(bank);
        if (!group) continue;
        const localForBank = new Map(
          Array.from(latestRef.current).filter(([key]) => bankNameOfKey(key) === bank)
        );
        void readWordBankFileById(group.fileId)
          .then((remoteText) => {
            const remoteWords = parseWordBankCsv(remoteText, bank, group.fileId);
            const remoteProgress = parseWordBankCsvProgress(remoteText, bank);
            const merged = mergeProgressMaps(remoteProgress, localForBank);
            return updateWordBankFileById(group.fileId, serializeWordBankCsv(remoteWords, merged));
          })
          .catch(() => {});
      }
    };
  }, []);

  return { entries, loading, saving, error, refresh, recordReview, recordMiss, flush };
}

/** 게임 페이지들이 props로 받아 쓰는 useProgress()의 반환 타입. */
export type ProgressController = ReturnType<typeof useProgress>;
