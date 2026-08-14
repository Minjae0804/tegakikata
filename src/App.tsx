import { useState } from 'react';
import { OnboardingPage } from './pages/OnboardingPage';
import { HomePage } from './pages/HomePage';
import { FillBlankGamePage } from './pages/FillBlankGamePage';
import { TranslateGamePage } from './pages/TranslateGamePage';
import { WordBankGamePage } from './pages/WordBankGamePage';
import { isDriveAuthenticated } from './lib/drive/driveClient';

type View = 'home' | 'fill-blank' | 'translate' | 'wordbank';

function App() {
  const [driveReady, setDriveReady] = useState(isDriveAuthenticated());
  const [view, setView] = useState<View>('home');

  const renderContent = () => {
    if (!driveReady) return <OnboardingPage onComplete={() => setDriveReady(true)} />;

    switch (view) {
      case 'fill-blank':
        return <FillBlankGamePage onExit={() => setView('home')} />;
      case 'translate':
        return <TranslateGamePage onExit={() => setView('home')} />;
      case 'wordbank':
        return <WordBankGamePage onExit={() => setView('home')} />;
      default:
        return (
          <HomePage
            onSelectFillBlank={() => setView('fill-blank')}
            onSelectTranslate={() => setView('translate')}
            onSelectWordBank={() => setView('wordbank')}
          />
        );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-[var(--radius-box)] border border-base-300 bg-white shadow-sm">
        {renderContent()}
      </div>
    </div>
  );
}

export default App;
