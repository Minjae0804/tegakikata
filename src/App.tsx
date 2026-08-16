import { useState } from 'react';
import { OnboardingPage } from './pages/OnboardingPage';
import { HomePage } from './pages/HomePage';
import { FillBlankGamePage } from './pages/FillBlankGamePage';
import { TranslateGamePage } from './pages/TranslateGamePage';
import { WordBankGamePage } from './pages/WordBankGamePage';
import { WordBankStudyPage } from './pages/WordBankStudyPage';
import { SettingsPage } from './pages/SettingsPage';
import { useProgress } from './hooks/useProgress';
import { isDriveAuthenticated, signOutDrive } from './lib/drive/driveClient';
import { LanguageProvider } from './lib/i18n/LanguageContext';

type View = 'home' | 'fill-blank' | 'translate' | 'wordbank' | 'wordbank-study' | 'settings';

function App() {
  const [driveReady, setDriveReady] = useState(isDriveAuthenticated());
  const [view, setView] = useState<View>('home');

  // 단어장 학습 진도(Anki SRS)는 게임 4종(빈칸 채우기/번역/단어장 맞추기/단어장 학습)이 전부 같은
  // 곳에 기록한다. 훅을 화면마다 따로 부르면 각자 자기 메모리에서만 진도를 들고 있다가 화면을
  // 벗어날 때 각자 드라이브에 flush하는데, 화면을 빠르게 넘나들면 나중에 flush된 쪽이 먼저 flush된
  // 쪽 기록을 덮어써서 유실될 수 있다 — 그래서 App 레벨에서 하나만 만들어 모든 게임이 공유한다.
  const progress = useProgress(driveReady);

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
    if (!driveReady) return <OnboardingPage onComplete={() => setDriveReady(true)} />;

    switch (view) {
      case 'fill-blank':
        return <FillBlankGamePage progress={progress} onExit={() => goTo('home')} />;
      case 'translate':
        return <TranslateGamePage progress={progress} onExit={() => goTo('home')} />;
      case 'wordbank':
        return <WordBankGamePage progress={progress} onExit={() => goTo('home')} />;
      case 'wordbank-study':
        return <WordBankStudyPage progress={progress} onExit={() => goTo('home')} />;
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
