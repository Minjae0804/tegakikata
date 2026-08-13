// grammar.md(사용자가 정리한 문법 노트) 로드/캐싱 훅
// AI가 예문/문제를 생성할 때 컨텍스트로 참고하도록 넘겨준다.
import { useCallback, useEffect, useState } from 'react';
import { readAppFile, writeAppFile } from '../lib/drive/driveClient';
import { getCached, setCached } from '../lib/storage/localCache';

const CACHE_KEY = 'grammarNotes';

/** enabled가 false면 자동 로드를 건너뛴다 (Drive 인증 전에는 호출하면 에러가 나므로). */
export function useGrammarNotes(enabled = true) {
  const [notes, setNotes] = useState<string>(() => getCached<string>(CACHE_KEY) ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const text = await readAppFile<string>('grammar.md');
      setNotes(text);
      setCached(CACHE_KEY, text);
    } catch (e) {
      setError(e instanceof Error ? e.message : '문법 노트를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateNotes = useCallback(async (next: string) => {
    setLoading(true);
    setError(null);
    try {
      await writeAppFile('grammar.md', next);
      setNotes(next);
      setCached(CACHE_KEY, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '문법 노트를 저장하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  return { notes, loading, error, refresh, updateNotes };
}
