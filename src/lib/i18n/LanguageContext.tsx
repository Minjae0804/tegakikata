// 플랫폼 UI 언어 컨텍스트. 앱 전체(App.tsx)에서 한 번 감싸두면, 어느 컴포넌트에서든
// useLanguage()로 현재 언어와 t() 번역 함수를 꺼내 쓸 수 있다.
//
// 저장은 로컬(localStorage)에만 한다 — 기기별로 다르게 볼 수도 있는 UI 설정이라 굳이 드라이브까지
// 동기화할 필요는 없다고 판단했다(AI 프로바이더/키 같은 진짜 계정 설정과는 성격이 다름).
import { createContext, useContext, useState, type ReactNode } from 'react';
import { translations, type Language } from './translations';
import { getCached, setCached } from '../storage/localCache';

export type { Language } from './translations';

const CACHE_KEY = 'uiLanguage';
const DEFAULT_LANGUAGE: Language = 'ko';

interface LanguageContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** 번역 문자열을 가져온다. vars를 주면 "{key}" 자리를 치환한다(예: t('a.b', { count: 3 })). */
  t: (key: keyof (typeof translations)['ko'], vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isLanguage(value: unknown): value is Language {
  return value === 'ko' || value === 'ja' || value === 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const cached = getCached<Language>(CACHE_KEY);
    return isLanguage(cached) ? cached : DEFAULT_LANGUAGE;
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    setCached(CACHE_KEY, lang);
  };

  const t: LanguageContextValue['t'] = (key, vars) => {
    let str = translations[language][key] ?? translations[DEFAULT_LANGUAGE][key] ?? String(key);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replaceAll(`{${k}}`, String(v));
      }
    }
    return str;
  };

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage()는 LanguageProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}
