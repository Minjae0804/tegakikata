// saves/progress-<단어장 이름>.json(단어장별 학습 진도 — SRS) 로드/캐싱/갱신 훅.
// 진도는 "전체 계정" 단위가 아니라 "개별 단어장(CSV 파일)" 단위로 따로 저장한다 — WordEntry.id가
// 이미 `${bankName}::...` 형태로 단어장 이름을 포함하고 있어서(lib/wordbank/csv.ts 참고), 이
// 훅은 그 id(혹은 skillKey로 감싼 id)에서 맨 앞 단어장 이름만 꺼내 어느 파일에 저장할지 정한다.
// 예전엔 saves/progress.json 하나에 전부 몰아넣었는데, 예전 데이터를 이어서 쓰려면 그 파일을
// saves/progress-<단어장 이름>.json으로 그대로 이름만 바꿔주면 된다 — 저장 형식 자체(ProgressStore/
// StoredProgressEntry)는 안 바뀌었다.
//
// 온보딩 때 단어장별 진도 파일이 따로 만들어지진 않는다 — 처음 그 단어장으로 뭔가를 풀어서
// flush될 때 없으면 새로 생긴다(writeAppFile이 없으면 생성, 있으면 갱신).
//
// 성능 관련 설계:
// - 진도는 Map<progressKey, ProgressEntry>로 색인해서 들고 있는다 — 단어 수가 많아져도 조회/갱신이
//   O(1). 지금 화면에 필요 없는 단어장의 진도까지 미리 다 불러오지 않고, activeBankNames(지금
//   선택된 단어장들)에 새로 들어온 이름만 그때그때 불러와서 이 맵에 얹는다.
// - 드라이브는 매 답변마다 쓰지 않는다. recordReview는 로컬 상태 + localStorage 캐시만 즉시 갱신하고
//   (그래서 UI는 기다릴 필요가 없다), 실제 드라이브 저장은 1분마다 자동으로 한 번에 모아서
//   반영한다(+ 화면 이동/언마운트 시점에도 한 번 더) — Drive API 왕복(검색+갱신)이 매번 드는
//   지연을 없애면서도, "나가기를 눌러야만 저장됨" 같은 상황 없이 주기적으로 안전하게 저장한다.
// - 저장 포맷도 압축한다: 필드명을 축약하고(StoredProgressEntry), pretty-print 없이 컴팩트 JSON으로 쓴다.
//
// 정합성(여러 세션 동시 사용): 같은 계정으로 브라우저 탭 + 설치한 PWA를 동시에 켜두거나, 폰·PC를
// 동시에 쓰는 경우 세션이 두 개 이상 떠 있을 수 있다. 그냥 로컬 맵을 통째로 덮어쓰면 나중에 flush한
// 세션이 먼저 flush한 세션의 갱신분을 지워버린다. 그래서 flush 직전에 드라이브의 최신 내용을 다시
// 읽어와 단어별로 병합한다(mergeWithRemote) — 단어별 lastReviewedAt이 더 최근인 쪽을 채택. 같은
// 단어를 두 세션에서 동시에 건드린 경우에만(드묾) 더 나중에 답한 쪽이 이긴다 — SRS 의미상으로도
// "가장 최근에 실제로 푼 결과"가 다음 복습 시각을 결정하는 게 맞다.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProgressEntry, ProgressStore, StoredProgressEntry } from '../types';
import { readAppFile, writeAppFile } from '../lib/drive/driveClient';
import { getCached, setCached } from '../lib/storage/localCache';
import { nextEntryAfterReview, nextEntryAfterMiss, type Rating } from '../lib/srs/schedule';

const CACHE_KEY = 'progress';

function progressPath(bankName: string): string {
  return `saves/progress-${bankName}.json`;
}

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

function toMap(store: ProgressStore | null | undefined): Map<string, ProgressEntry> {
  return new Map(Object.entries(store?.w ?? {}).map(([id, s]) => [id, fromStoredEntry(id, s)]));
}

function toStore(map: Map<string, ProgressEntry>): ProgressStore {
  const w: Record<string, StoredProgressEntry> = {};
  for (const [id, e] of map) w[id] = toStoredEntry(e);
  return { w };
}

/** 주어진 단어장들의 진도 파일을 읽어서 하나로 합친다. 파일이 아직 없으면(그 단어장을 한 번도
 *  안 풀어봤으면) 빈 진도로 취급한다. */
async function fetchBanks(bankNames: string[]): Promise<Map<string, ProgressEntry>> {
  const maps = await Promise.all(
    bankNames.map(async (bank) => {
      try {
        return toMap(await readAppFile<ProgressStore>(progressPath(bank)));
      } catch {
        return new Map<string, ProgressEntry>();
      }
    })
  );
  const combined = new Map<string, ProgressEntry>();
  for (const m of maps) for (const [k, v] of m) combined.set(k, v);
  return combined;
}

/**
 * 드라이브에 지금 저장된 특정 단어장의 최신 진도와, 그 단어장에 해당하는 로컬 진도를 단어별로
 * 병합한다. 단어별 lastReviewedAt이 더 최근인 쪽을 채택 — 로컬에서 안 건드린 단어를 다른 세션이
 * 그새 갱신했으면 그 갱신분을 살리고, 로컬에서 방금 건드린 단어는(항상 lastReviewedAt이 지금
 * 시각이라) 로컬이 이긴다. 드라이브 파일을 못 읽으면(최초 저장 등) 로컬 그대로 반환한다.
 */
async function mergeWithRemote(path: string, local: Map<string, ProgressEntry>): Promise<Map<string, ProgressEntry>> {
  let remote: Map<string, ProgressEntry>;
  try {
    remote = toMap(await readAppFile<ProgressStore>(path));
  } catch {
    return local;
  }
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
 * enabled가 false면 자동 로드를 건너뛴다 (Drive 인증 전에는 호출하면 에러가 나므로).
 * activeBankNames는 "지금 화면에 걸려있는 단어장 이름들"(WordEntry.bankName) — 이 목록에 새로
 * 들어온 이름이 있으면 그 단어장의 진도 파일을 그때 불러와서 합친다. 매 렌더마다 새 배열을
 * 넘기면 불필요한 재확인이 생기니, 호출하는 쪽(App.tsx)에서 useMemo로 안정된 참조를 넘기는 걸 권장한다.
 */
export function useProgress(enabled = true, activeBankNames: string[] = []) {
  const [entries, setEntries] = useState<Map<string, ProgressEntry>>(() =>
    toMap(getCached<ProgressStore>(CACHE_KEY))
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // recordReview는 답변마다 호출되지만 드라이브 쓰기는 flush에서만 일어난다.
  // 최신 상태를 참조하려고 ref도 같이 들고 있는다(언마운트 시점엔 state를 새로 못 읽으므로).
  const latestRef = useRef(entries);
  // 이미 진도를 불러온 단어장 이름들 — activeBankNames에 이미 있는 이름이면 다시 안 불러온다.
  const loadedBanksRef = useRef<Set<string>>(new Set());
  // 아직 드라이브에 반영 안 된(로컬에서만 바뀐) 단어장 이름들 — flush 때 이것만 골라 저장한다.
  const dirtyBanksRef = useRef<Set<string>>(new Set());
  const activeBankNamesRef = useRef(activeBankNames);
  useEffect(() => {
    latestRef.current = entries;
  }, [entries]);
  useEffect(() => {
    activeBankNamesRef.current = activeBankNames;
  }, [activeBankNames]);

  /** 지금 활성화된 단어장 목록을 다시 불러온다(강제 새로고침 — loadedBanksRef 여부와 무관하게). */
  const refresh = useCallback(async () => {
    const banks = activeBankNamesRef.current;
    if (banks.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const loadedMap = await fetchBanks(banks);
      for (const bank of banks) loadedBanksRef.current.add(bank);
      setEntries((prev) => {
        const next = new Map(prev);
        for (const [k, v] of loadedMap) next.set(k, v);
        latestRef.current = next;
        setCached(CACHE_KEY, toStore(next));
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '학습 진도를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // activeBankNames에 아직 안 불러온 단어장이 새로 들어오면(단어장을 새로 고르는 등) 그것만 불러온다.
  useEffect(() => {
    if (!enabled) return;
    const toLoad = activeBankNames.filter((b) => !loadedBanksRef.current.has(b));
    if (toLoad.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchBanks(toLoad)
      .then((loadedMap) => {
        if (cancelled) return;
        for (const bank of toLoad) loadedBanksRef.current.add(bank);
        setEntries((prev) => {
          const next = new Map(prev);
          for (const [k, v] of loadedMap) next.set(k, v);
          latestRef.current = next;
          setCached(CACHE_KEY, toStore(next));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeBankNames는 호출하는 쪽에서 메모이즈해 참조를 넘긴다
  }, [enabled, activeBankNames]);

  /** 지금까지 쌓인 진도를, 바뀐 단어장들만 골라 드라이브의 최신 내용과 병합해서 반영한다. */
  const flush = useCallback(async () => {
    const dirtyBanks = Array.from(dirtyBanksRef.current);
    if (dirtyBanks.length === 0) return;
    dirtyBanksRef.current.clear();
    setSaving(true);
    setError(null);
    const failedBanks: string[] = [];
    for (const bank of dirtyBanks) {
      try {
        const localForBank = new Map(
          Array.from(latestRef.current).filter(([key]) => bankNameOfKey(key) === bank)
        );
        const merged = await mergeWithRemote(progressPath(bank), localForBank);
        // 컴팩트 JSON(들여쓰기 없음)으로 직접 문자열을 만들어 넘긴다 — writeAppFile은 문자열을
        // 받으면 그대로 쓰므로, 이 파일만 pretty-print 없이 저장돼 페이로드가 줄어든다.
        await writeAppFile(progressPath(bank), JSON.stringify(toStore(merged)));
        // 병합 결과(다른 세션이 그새 갱신한 부분 포함)를 로컬 상태에도 반영한다. mergeWithRemote가
        // 드라이브를 읽는 동안(await) 사용자가 바로 다음 문제를 풀어서 latestRef.current가 이미
        // merged 스냅샷보다 더 앞서 있을 수 있으므로, merged로 그냥 덮어쓰지 않고 "그 사이에 더
        // 최신인 로컬 항목"과 다시 한번 단어별로 합쳐서 반영한다 — 안 그러면 대기 중에 방금 입력한
        // 답이 화면에서 잠깐 사라졌다가 다음 flush에야 돌아오는 것처럼 보인다(이 단어장은 방금
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
          setCached(CACHE_KEY, toStore(combined));
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
      setCached(CACHE_KEY, toStore(next));
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
      setCached(CACHE_KEY, toStore(next));
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
  // 단어장별로 드라이브 최신 내용과 병합 후 쓴다 — 여기서는 언마운트 이후라 로컬 state는 못
  // 되돌리지만, 어차피 다음 마운트 때 다시 읽어오므로 문제없다.
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 언마운트 시점의 최신 값을 읽는다(ref가 DOM 노드가 아니라 누적되는 Set/Map이라, 마운트 시점 스냅샷을 복사해두면 오히려 틀린 값이 된다)
      for (const bank of dirtyBanksRef.current) {
        const localForBank = new Map(
          Array.from(latestRef.current).filter(([key]) => bankNameOfKey(key) === bank)
        );
        void mergeWithRemote(progressPath(bank), localForBank)
          .then((merged) => writeAppFile(progressPath(bank), JSON.stringify(toStore(merged))))
          .catch(() => {});
      }
    };
  }, []);

  return { entries, loading, saving, error, refresh, recordReview, recordMiss, flush };
}

/** 게임 페이지들이 props로 받아 쓰는 useProgress()의 반환 타입. */
export type ProgressController = ReturnType<typeof useProgress>;
