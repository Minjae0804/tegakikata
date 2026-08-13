// 드라이브 인증 + 앱 폴더 구조 온보딩 상태를 관리하는 훅
import { useCallback, useState } from 'react';
import { initDriveAuth, ensureAppFolderStructure, isDriveAuthenticated } from '../lib/drive/driveClient';

type DriveSyncStatus = 'idle' | 'authenticating' | 'creatingFolders' | 'ready' | 'error';

export function useDriveSync() {
  const [status, setStatus] = useState<DriveSyncStatus>(
    isDriveAuthenticated() ? 'ready' : 'idle'
  );
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setStatus('authenticating');
    setError(null);
    try {
      await initDriveAuth();
      // 인증과 폴더/파일 생성을 별개 단계로 보여주기 위해 상태를 나눠서 갱신한다.
      setStatus('creatingFolders');
      await ensureAppFolderStructure();
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Google Drive 연결에 실패했습니다.');
    }
  }, []);

  return { status, error, connect };
}
