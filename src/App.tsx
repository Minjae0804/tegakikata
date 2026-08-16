import { useEffect, useState } from 'react';
import { OnboardingPage } from './pages/OnboardingPage';
import { HomePage } from './pages/HomePage';
import { FillBlankGamePage } from './pages/FillBlankGamePage';
import { TranslateGamePage } from './pages/TranslateGamePage';
import { WordBankGamePage } from './pages/WordBankGamePage';
import { WordBankStudyPage } from './pages/WordBankStudyPage';
import { SettingsPage } from './pages/SettingsPage';
import { useProgress } from './hooks/useProgress';
import { useWordBank } from './hooks/useWordBank';
import { isDriveAuthenticated, signOutDrive, tryRestoreDriveAuth } from './lib/drive/driveClient';
import { LanguageProvider } from './lib/i18n/LanguageContext';

type View = 'home' | 'fill-blank' | 'translate' | 'wordbank' | 'wordbank-study' | 'settings';

function App() {
  const [driveReady, setDriveReady] = useState(isDriveAuthenticated());
  // 새로고침하면 driveReady는 항상 false로 시작한다(액세스 토큰이 메모리에만 있어서) — 그렇다고
  // 바로 온보딩 화면부터 보여주면 이전에 연결했던 사용자도 매번 로그인 화면을 다시 봐야 한다.
  // 그래서 마운트 시점에 딱 한 번, 화면엔 아무것도 안 띄우고 조용히 토큰 복원을 시도해본다 —
  // 성공하면 바로 홈으로, 실패하면(최초 방문/세션 만료 등) 기존처럼 온보딩을 보여준다.
  const [restoringAuth, setRestoringAuth] = useState(!isDriveAuthenticated());
  const [view, setView] = useState<View>('home');

  useEffect(() => {
    if (driveReady) return;
    let cancelled = false;
    void tryRestoreDriveAuth().then((restored) => {
      if (cancelled) return;
      if (restored) setDriveReady(true);
      setRestoringAuth(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 새로고침 직후 마운트 시점에 한 번만 시도한다
  }, []);

  // 단어장 선택(useWordBank)도 App 레벨에서 하나만 만들어 공유한다 — 화면마다 따로 만들면 한
  // 화면에서 단어장을 바꿔도 다른 화면은 자기가 마운트될 때 캐시된 값을 다시 읽어와야만 반영돼서
  // 어긋날 수 있다. 진도(useProgress)는 이제 단어장 CSV 자체에 컬럼으로 저장되므로, 어느
  // 단어장(CSV/fileId)에 진도를 다시 써넣을지 알아야 해서 wordBank.words를 그대로 넘긴다.
  const wordBank = useWordBank(driveReady);

  // 단어장 학습 진도(Anki SRS)는 게임 4종(빈칸 채우기/번역/단어장 맞추기/단어장 학습)이 전부 같은
  // 곳에 기록한다. 훅을 화면마다 따로 부르면 각자 자기 메모리에서만 진도를 들고 있다가 화면을
  // 벗어날 때 각자 드라이브에 flush하는데, 화면을 빠르게 넘나들면 나중에 flush된 쪽이 먼저 flush된
  // 쪽 기록을 덮어써서 유실될 수 있다 — 그래서 App 레벨에서 하나만 만들어 모든 게임이 공유한다.
  const progress = useProgress(driveReady, wordBank.words);

  /** 진도를 먼저 드라이브에 반영하고 나서 화면을 옮긴다. */
  const goTo = (next: View) => {
    void progress.flush();
    setView(next);
  };

  const handleLogout = () => {
    void progress.flush();
    signOutDrive();
    setDriveReady(false);
    setView('home');
  };

  const renderContent = () => {
    if (restoringAuth) {
      return (
        <div className="flex flex-col items-center gap-3 p-12">
          <span className="loading loading-spinner loading-md text-primary" />
          <p className="font-body text-xs text-base-content/50">이전 로그인 정보를 확인하는 중...</p>
        </div>
      );
    }
    if (!driveReady) return <OnboardingPage onComplete={() => setDriveReady(true)} />;

    switch (view) {
      case 'fill-blank':
        return <FillBlankGamePage progress={progress} wordBank={wordBank} onExit={() => goTo('home')} />;
      case 'translate':
        return <TranslateGamePage progress={progress} wordBank={wordBank} onExit={() => goTo('home')} />;
      case 'wordbank':
        return <WordBankGamePage progress={progress} wordBank={wordBank} onExit={() => goTo('home')} />;
      case 'wordbank-study':
        return <WordBankStudyPage progress={progress} wordBank={wordBank} onExit={() => goTo('home')} />;
      case 'settings':
        return <SettingsPage onBack={() => goTo('home')} />;
      default:
        return (
          <HomePage
            onSelectFillBlank={() => goTo('fill-blank')}
            onSelectTranslate={() => goTo('translate')}
            onSelectWordBank={() => goTo('wordbank')}
            onSelectWordBankStudy={() => goTo('wordbank-study')}
            onOpenSettings={() => goTo('settings')}
            onLogout={handleLogout}
          />
        );
    }
  };

  return (
    <LanguageProvider>
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-md rounded-[var(--radius-box)] border border-base-300 bg-white shadow-sm">
          {renderContent()}
        </div>
      </div>
    </LanguageProvider>
  );
}

export default App;
