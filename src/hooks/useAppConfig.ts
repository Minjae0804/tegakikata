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

  useEffect(() => {
    if (enabled && !config) void refresh();
  }, [enabled, config, refresh]);

  return { config, loading, error, refresh, updateConfig };
}
