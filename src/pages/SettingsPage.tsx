// 설정 화면: 온보딩 때 고른 AI 프로바이더/API 키/모델을 나중에라도 앱 안에서 바꿀 수 있게 한다.
import { useEffect, useState } from 'react';
import { useAppConfig } from '../hooks/useAppConfig';
import { AiConfigForm } from '../components/settings/AiConfigForm';
import { Button } from '../components/common/Button';
import type { AiProvider } from '../types';

interface SettingsPageProps {
  onBack?: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  const { config, loading, error, updateConfig } = useAppConfig(true);

  const [aiProvider, setAiProvider] = useState<AiProvider>('claude');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('');
  const [claudeModel, setClaudeModel] = useState('');
  const [saved, setSaved] = useState(false);

  // config가 로드되면(항상 이미 온보딩을 마친 상태로만 들어오는 화면이라 값이 있을 것) 입력창에 반영한다.
  useEffect(() => {
    if (!config) return;
    setAiProvider(config.aiProvider ?? 'claude');
    setGeminiApiKey(config.geminiApiKey ?? '');
    setClaudeApiKey(config.claudeApiKey ?? '');
    setGeminiModel(config.geminiModel ?? '');
    setClaudeModel(config.claudeModel ?? '');
  }, [config]);

  // 뭔가 고치면 "저장했어요" 문구는 다시 숨긴다.
  useEffect(() => {
    setSaved(false);
  }, [aiProvider, geminiApiKey, claudeApiKey, geminiModel, claudeModel]);

  const currentKey = aiProvider === 'gemini' ? geminiApiKey : claudeApiKey;
  const setCurrentKey = aiProvider === 'gemini' ? setGeminiApiKey : setClaudeApiKey;
  const currentModel = aiProvider === 'gemini' ? geminiModel : claudeModel;
  const setCurrentModel = aiProvider === 'gemini' ? setGeminiModel : setClaudeModel;

  const handleSave = async () => {
    await updateConfig({ aiProvider, geminiApiKey, claudeApiKey, geminiModel, claudeModel });
    setSaved(true);
  };

  return (
    <div className="flex flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-body text-xs tracking-[0.3em] text-base-content/40 uppercase">설정</p>
          <h1 className="font-display text-xl text-base-content">AI 설정</h1>
        </div>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            나가기
          </Button>
        )}
      </header>

      <AiConfigForm
        aiProvider={aiProvider}
        onProviderChange={setAiProvider}
        apiKey={currentKey}
        onApiKeyChange={setCurrentKey}
        model={currentModel}
        onModelChange={setCurrentModel}
        disabled={loading}
      />

      {error && <p className="font-body text-xs text-secondary">{error}</p>}
      {saved && !loading && <p className="font-body text-xs text-primary">저장했어요.</p>}

      <Button variant="primary" onClick={() => void handleSave()} disabled={!currentKey.trim() || loading}>
        {loading ? '저장하는 중...' : '저장'}
      </Button>
    </div>
  );
}
