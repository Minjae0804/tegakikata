// AI 프로바이더/API 키/모델 입력 폼. 온보딩(최초 설정)과 설정 화면(나중에 수정)에서 공용으로 쓴다.
import { DEFAULT_GEMINI_MODEL } from '../../lib/gemini/geminiClient';
import { DEFAULT_CLAUDE_MODEL } from '../../lib/claude/claudeClient';
import type { AiProvider } from '../../types';

// 프리셋 목록. Gemini는 지금 코드가 검증한 모델 하나만 — 나머지는 사용자가 직접 입력하게 둔다
// (https://ai.google.dev/api/models 에서 최신 모델명 확인). Claude 세 모델은 확인된 현재 모델 ID.
export const MODEL_PRESETS: Record<AiProvider, string[]> = {
  gemini: [DEFAULT_GEMINI_MODEL],
  claude: [DEFAULT_CLAUDE_MODEL, 'claude-sonnet-5', 'claude-opus-5'],
};

export function defaultModelFor(provider: AiProvider): string {
  return provider === 'gemini' ? DEFAULT_GEMINI_MODEL : DEFAULT_CLAUDE_MODEL;
}

interface AiConfigFormProps {
  aiProvider: AiProvider;
  onProviderChange: (provider: AiProvider) => void;
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  model: string;
  onModelChange: (value: string) => void;
  disabled?: boolean;
}

export function AiConfigForm({
  aiProvider,
  onProviderChange,
  apiKey,
  onApiKeyChange,
  model,
  onModelChange,
  disabled,
}: AiConfigFormProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="font-body text-xs text-base-content/60">AI 프로바이더</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onProviderChange('claude')}
            className={`btn btn-sm flex-1 rounded-[var(--radius-field)] ${
              aiProvider === 'claude' ? 'btn-primary' : 'btn-outline'
            }`}
          >
            Claude
          </button>
          <button
            type="button"
            onClick={() => onProviderChange('gemini')}
            className={`btn btn-sm flex-1 rounded-[var(--radius-field)] ${
              aiProvider === 'gemini' ? 'btn-primary' : 'btn-outline'
            }`}
          >
            Gemini
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-body text-xs text-base-content/60">
          {aiProvider === 'gemini' ? 'Gemini' : 'Claude'} API 키
        </span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          placeholder={aiProvider === 'gemini' ? 'AIza... 또는 AQ...' : 'sk-ant-...'}
          className="input input-bordered w-full rounded-[var(--radius-field)] font-data text-xs"
          disabled={disabled}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="font-body text-xs text-base-content/60">모델 (선택 — 비워두면 기본값 사용)</span>
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onModelChange(e.target.value);
          }}
          className="select select-bordered w-full rounded-[var(--radius-field)] text-xs"
          disabled={disabled}
        >
          <option value="">프리셋에서 고르기...</option>
          {MODEL_PRESETS[aiProvider].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder={defaultModelFor(aiProvider)}
          className="input input-bordered w-full rounded-[var(--radius-field)] font-data text-xs"
          disabled={disabled}
        />
      </label>
    </div>
  );
}
