// 플랫폼 UI 언어(한국어/日本語/English) 전환 토글. 설정 화면과 온보딩 화면에서 공용으로 쓴다.
import { useLanguage } from '../../lib/i18n/LanguageContext';
import { LANGUAGE_LABELS, type Language } from '../../lib/i18n/translations';

const LANGUAGES: Language[] = ['ko', 'ja', 'en'];

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex gap-1">
      {LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          className={`btn btn-xs rounded-[var(--radius-field)] ${language === lang ? 'btn-primary' : 'btn-ghost'}`}
        >
          {LANGUAGE_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
