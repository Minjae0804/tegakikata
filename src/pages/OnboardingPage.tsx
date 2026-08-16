// 최초 로그인 시: 드라이브 인증 -> 폴더/파일 생성 -> AI API 키 입력(선택)
// 구글 OAuth 클라이언트 ID는 배포 도메인에 묶이는 값이라 사용자가 입력하지 않는다.
// (빌드 타임 환경변수 VITE_GOOGLE_CLIENT_ID로 주입 — src/lib/drive/driveClient.ts 참고)
// 이미 한 번 온보딩을 마친 재방문이면(완료 플래그 캐시됨) 체크리스트 없이 버튼 하나로 바로 이어진다.
//
// AI API 키는 선택사항이다 — 안 넣고 시작해도 되고, 그 경우 AI가 필요한 게임(빈칸 채우기/번역,
// 단어장 맞추기의 AI 채점 방향)만 나중에 못 쓸 뿐, 단어장 관련 기능(단어장 학습, 단어장 맞추기의
// 한자 쓰기 방향)은 바로 쓸 수 있다. 키는 설정 화면에서 언제든 나중에 등록할 수 있다.
//
// AI는 Gemini/Claude 중 고를 수 있다. 2026-08 기준 Gemini 쪽 프로젝트 접근 이슈가 있어
// 기본값은 Claude로 두되, 문제가 풀리면 언제든 Gemini로 바꿀 수 있게 선택지를 남겨둔다.
import { useEffect, useState } from 'react';
import { useDriveSync } from '../hooks/useDriveSync';
import { useAppConfig } from '../hooks/useAppConfig';
import { hasRequiredApiKey } from '../lib/ai/aiClient';
import { AiConfigForm } from '../components/settings/AiConfigForm';
import { OnboardingStepCard } from '../components/onboarding/OnboardingStepCard';
import { Button } from '../components/common/Button';
import { getCached, setCached } from '../lib/storage/localCache';
import type { AiProvider } from '../types';

const ONBOARDED_CACHE_KEY = 'hasOnboarded';

interface OnboardingPageProps {
  onComplete?: () => void;
}

export function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const { status, error, connect } = useDriveSync();
  const driveReady = status === 'ready';

  const {
    config,
    loading: configLoading,
    error: configError,
    updateConfig,
  } = useAppConfig(driveReady);

  const [aiProvider, setAiProvider] = useState<AiProvider>('claude');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('');
  const [claudeModel, setClaudeModel] = useState('');
  const isReturningUser = Boolean(getCached<boolean>(ONBOARDED_CACHE_KEY));

  // config가 드라이브에서 로드되면(재방문 시 기존 값 포함) 입력창 초기값으로 반영한다.
  useEffect(() => {
    if (!config) return;
    setAiProvider(config.aiProvider ?? 'claude');
    if (config.geminiApiKey) setGeminiApiKey(config.geminiApiKey);
    if (config.claudeApiKey) setClaudeApiKey(config.claudeApiKey);
    if (config.geminiModel) setGeminiModel(config.geminiModel);
    if (config.claudeModel) setClaudeModel(config.claudeModel);
  }, [config]);

  const currentKey = aiProvider === 'gemini' ? geminiApiKey : claudeApiKey;
  const setCurrentKey = aiProvider === 'gemini' ? setGeminiApiKey : setClaudeApiKey;
  const currentModel = aiProvider === 'gemini' ? geminiModel : claudeModel;
  const setCurrentModel = aiProvider === 'gemini' ? setGeminiModel : setClaudeModel;

  const handleComplete = () => {
    setCached(ONBOARDED_CACHE_KEY, true);
    onComplete?.();
  };

  /** API 키를 입력했으면 저장하고, 안 입력했어도(AI 없이 시작) 그대로 온보딩을 완료한다. */
  const handleStart = async () => {
    await updateConfig({ aiProvider, geminiApiKey, claudeApiKey, geminiModel, claudeModel });
    handleComplete();
  };

  // 세 단계: 인증 -> 폴더/파일 생성 -> API 키 입력(선택 — 체크는 되지만 진행을 막진 않음)
  const step1Done = status === 'creatingFolders' || status === 'ready';
  const step2Done = status === 'ready';
  const step3Done = driveReady && hasRequiredApiKey(config);

  const isBusy = status === 'authenticating' || status === 'creatingFolders';

  const connectButtonLabel =
    status === 'authenticating'
      ? '구글 로그인 대기 중...'
      : status === 'creatingFolders'
        ? '드라이브 확인하는 중...'
        : isReturningUser
          ? '드라이브 다시 연결'
          : '드라이브 연결';

  // ── 재방문: 간소화된 화면 ──────────────────────────
  if (isReturningUser && !driveReady) {
    return (
      <div className="flex flex-col gap-8 p-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl text-base-content">다시 연결하기</h1>
          <p className="font-body text-sm text-base-content/60">
            이전에 연결한 드라이브 계정으로 다시 로그인해요.
          </p>
        </header>

        {error && <p className="font-body text-xs text-secondary">{error}</p>}

        <Button variant="primary" onClick={() => void connect()} disabled={isBusy}>
          {connectButtonLabel}
        </Button>
      </div>
    );
  }

  // 재방문이면(설정 로드까지 끝났으면) API 키 유무와 상관없이 바로 완료 처리 — 키는 선택사항이다.
  if (isReturningUser && driveReady && !configLoading) {
    return (
      <div className="flex flex-col gap-8 p-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl text-base-content">연결 완료</h1>
          <p className="font-body text-sm text-base-content/60">기존 설정을 그대로 불러왔어요.</p>
        </header>
        <Button variant="primary" onClick={handleComplete}>
          시작하기
        </Button>
      </div>
    );
  }

  // ── 최초 방문: 체크리스트 ───────────────────────────
  return (
    <div className="flex flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <p className="font-body text-xs tracking-[0.3em] text-base-content/40 uppercase">Onboarding</p>
        <h1 className="font-display text-2xl text-base-content">테가키카타 시작하기</h1>
        <p className="font-body text-sm text-base-content/60">
          학습 데이터를 저장할 구글 드라이브를 연결해요. 서버 없이 사용자의 드라이브에만 데이터가 저장돼요.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <OnboardingStepCard
          step={1}
          title="드라이브 인증"
          description="구글 로그인 팝업에서 계정을 선택하고 접근을 허용해요."
          isDone={step1Done}
        />
        <OnboardingStepCard
          step={2}
          title="사용할 폴더/파일 생성"
          description="/TegakikataApp 폴더와 config.json, grammar.md 등 기본 파일을 드라이브에 만들어요."
          isDone={step2Done}
        />
        <OnboardingStepCard
          step={3}
          title="AI API 키 입력 (선택)"
          description="예문 생성과 채점에 쓸 AI를 고르고, 해당 API 키를 드라이브 설정 파일에 저장해요. 안 넣으면 단어장 관련 기능만 바로 쓸 수 있고, 나중에 설정에서 언제든 추가할 수 있어요."
          isDone={step3Done}
        />
      </div>

      {!driveReady && (
        <div className="flex flex-col gap-3">
          {error && <p className="font-body text-xs text-secondary">{error}</p>}
          <Button variant="primary" onClick={() => void connect()} disabled={isBusy}>
            {connectButtonLabel}
          </Button>
        </div>
      )}

      {driveReady && (
        <div className="flex flex-col gap-3">
          <AiConfigForm
            aiProvider={aiProvider}
            onProviderChange={setAiProvider}
            apiKey={currentKey}
            onApiKeyChange={setCurrentKey}
            model={currentModel}
            onModelChange={setCurrentModel}
            disabled={configLoading}
          />

          {configError && <p className="font-body text-xs text-secondary">{configError}</p>}

          <Button variant="primary" onClick={() => void handleStart()} disabled={configLoading}>
            {configLoading ? '저장하는 중...' : currentKey.trim() ? '시작하기' : 'AI 없이 시작하기'}
          </Button>
          {!currentKey.trim() && (
            <p className="font-body text-xs text-base-content/40">
              지금은 AI 없이 시작해도 단어장 관련 기능은 바로 쓸 수 있어요. 나중에 설정에서 키를 추가하면 돼요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
