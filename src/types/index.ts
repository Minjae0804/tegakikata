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

/**
 * 런타임에서 다루는 형태 (wordId 포함). 훅에서는 Map<wordId, ProgressEntry>로 색인해서 쓴다.
 * Anki(SM-2 변형) 방식의 간격 반복 상태 — lib/srs/schedule.ts 참고.
 */
export interface ProgressEntry {
  wordId: string;
  ease: number; // 이지팩터(ease factor). 기본 2.5, 최소 1.3 — 높을수록 간격이 빨리 늘어남
  intervalDays: number; // 가장 최근에 계산된 복습 간격(일)
  reps: number; // "다시" 이외의 평가를 받은 누적 횟수 (통계용)
  lapses: number; // "다시"를 받은 누적 횟수 (통계용 — 몇 번 까먹었는지)
  lastReviewedAt?: string; // 이 단어를 마지막으로 풀었던 시각 (ISO) — "언제 접속했는지"에 해당
  nextReviewAt?: string; // 이 시각 이후로 복습 대상이 됨. 없으면(한 번도 안 풀었으면) 항상 대상
}

/** saves/progress.json에 저장되는 압축 형태. wordId는 키로만 쓰고 값엔 안 넣고(중복 제거),
 *  필드명도 축약해서 단어 수가 많아져도 페이로드/파싱 비용이 커지지 않게 한다. */
export interface StoredProgressEntry {
  e: number; // ease
  iv: number; // intervalDays
  r: number; // reps
  la: number; // lapses
  l?: string; // lastReviewedAt
  n?: string; // nextReviewAt
}

export interface ProgressStore {
  w: Record<string, StoredProgressEntry>; // wordId -> entry
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
  geminiModel?: string; // 비워두면 각 클라이언트의 기본 모델을 씀
  claudeModel?: string;
}

export type GameMode = 'fill-blank' | 'translate';

export interface FillBlankQuestion {
  sentence: string; // 빈칸이 포함된 예문 (___ 로 표기)
  targetWord: WordEntry;
  translation: string; // 예문 전체의 한국어 해석 — 답 확인할 때 같이 보여준다
}

export interface TranslateQuestion {
  koreanSentence: string;
  referenceJapanese?: string; // 채점 참고용, 사용자에게 노출 안 함
}

export interface TranslateGradeResult {
  isCorrect: boolean;
  feedback: string;
}

/** 단어장 맞추기 게임의 "한자 → 읽기/뜻" 방향 채점 결과. */
export interface WordRecallGradeResult {
  readingCorrect: boolean;
  meaningCorrect: boolean;
  feedback: string;
}
