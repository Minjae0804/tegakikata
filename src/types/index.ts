// 도메인 전역 타입 정의

export interface WordEntry {
  id: string;
  kanji: string;
  reading: string;
  meaning: string;
  jlptLevel?: 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
  notes?: string; // 사용자 메모 (예문, 헷갈리는 포인트 등)
}

export interface WordBank {
  id: string;
  name: string;
  words: WordEntry[];
  lastUsed?: string; // ISO date
}

export interface ProgressEntry {
  wordId: string;
  correctCount: number;
  incorrectCount: number;
  lastReviewedAt?: string;
  nextReviewAt?: string; // SRS
}

export interface UserProfile {
  currentLevel?: WordEntry['jlptLevel'];
  learningStartedAt?: string;
}

export type AiProvider = 'gemini' | 'claude';

export interface AppConfig {
  aiProvider: AiProvider;
  geminiApiKey?: string;
  claudeApiKey?: string;
}

export type GameMode = 'fill-blank' | 'translate';

export interface FillBlankQuestion {
  sentence: string; // 빈칸이 포함된 예문 (___ 로 표기)
  targetWord: WordEntry;
}

export interface TranslateQuestion {
  koreanSentence: string;
  referenceJapanese?: string; // 채점 참고용, 사용자에게 노출 안 함
}

export interface TranslateGradeResult {
  isCorrect: boolean;
  feedback: string;
}
