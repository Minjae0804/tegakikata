// config.json(AI 프로바이더 선택 및 API 키 등) 로드/캐싱 훅
import { useCallback, useEffect, useState } from 'react';
import type { AppConfig } from '../types';
import { readAppFile, writeAppFile } from '../lib/drive/driveClient';
import { getCached, setCached } from '../lib/storage/localCache';

const CACHE_KEY = 'appConfig';

/** enabled가 false면 자동 로드를 건너뛴다 (Drive 인증 전에는 호출하면 에러가 나므로). */
export function useAppConfig(enabled = true) {
  const [config, setConfig] = useState<AppConfig | null>(() => getCached<AppConfig>(CACHE_KEY));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await readAppFile<AppConfig>('config.json');
      setConfig(loaded);
      setCached(CACHE_KEY, loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : '설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfig = useCallback(async (next: AppConfig) => {
    setLoading(true);
    setError(null);
    try {
      await writeAppFile('config.json', next);
      setConfig(next);
      setCached(CACHE_KEY, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '설정을 저장하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 로컬 캐시가 있어도(이 기기에서 예전에 써본 적 있어도) 마운트/enabled 전환 시엔 항상 드라이브의
  // 최신 config.json을 다시 읽어온다 — 캐시는 그동안 화면이 깜빡이지 않게 초기값으로만 쓴다.
  // 예전엔 "캐시가 없을 때만" 불러왔는데, 그러면 다른 기기(또는 드라이브에서 직접 수정)에서 API
  // 키/설정을 바꿔도 이 기기는 최초 1회 캐싱된 값을 영영 그대로 쓰게 되는 문제가 있었다.
  useEffect(() => {
    if (!enabled) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enabled가 켜질 때마다(마운트 포함) 한 번 새로고침
  }, [enabled]);

  return { config, loading, error, refresh, updateConfig };
}
