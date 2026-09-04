// 도메인 전역 타입 정의

export interface WordEntry {
  /** 단어장(CSV 파일) 안에서만이 아니라 전체에서 유일한 값 — bankName을 포함해서 만든다
   *  (lib/wordbank/csv.ts의 makeWordId 참고). 학습 진도도 이 id를 키로 쓰므로, 같은 단어라도
   *  단어장이 다르면 서로 다른 진도로 취급된다. */
  id: string;
  /** 이 단어가 어느 단어장(CSV 파일)에서 왔는지 — 그 단어장 CSV 자체에 진도를 같이 저장하는 데
   *  쓴다(hooks/useProgress.ts 참고). */
  bankName: string;
  /** 이 단어가 온 CSV 파일의 드라이브 파일 ID — 진도를 그 파일에 다시 써넣을 때(덮어쓸 파일을
   *  찾을 때) bankName만으로는(이름 기준 검색) 느리거나 꼬일 수 있어서 ID로 직접 쓴다. */
  fileId: string;
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
  intervalMinutes: number; // 가장 최근에 계산된 복습 간격(분 단위 — 화면엔 초/분/시간/일로 적절히 표시)
  reps: number; // "다시" 이외의 평가를 받은 누적 횟수 (통계용)
  lapses: number; // "다시"를 받은 누적 횟수 (통계용 — 몇 번 까먹었는지)
  lastReviewedAt?: string; // 이 단어를 마지막으로 풀었던 시각 (ISO) — "언제 접속했는지"에 해당
  nextReviewAt?: string; // 이 시각 이후로 복습 대상이 됨. 없으면(한 번도 안 풀었으면) 항상 대상
}

/** 진도 압축 형태 — 단어장 CSV의 진도 컬럼(kanji_e/iv/r/la/l/n, reading_e/iv/r/la/l/n)에 그대로
 *  대응한다(hooks/useProgress.ts, lib/wordbank/csv.ts 참고). 예전엔 saves/progress-<단어장
 *  이름>.json이라는 별도 파일에 이 형태로 저장했는데, 지금은 단어장 CSV 자체에 컬럼으로 저장한다 —
 *  예전 파일이 남아있으면 최초 로드 시 한 번 병합해서 끌어온다(마이그레이션, useProgress.ts 참고).
 *  필드명은 축약해서 단어 수가 많아져도 페이로드/파싱 비용이 커지지 않게 한다. */
export interface StoredProgressEntry {
  e: number; // ease
  iv: number; // intervalMinutes
  r: number; // reps
  la: number; // lapses
  l?: string; // lastReviewedAt
  n?: string; // nextReviewAt
}

/** 예전 saves/progress-<단어장 이름>.json 파일 형식 — 마이그레이션(1회성 병합) 읽기 전용으로만 쓴다. */
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

/** 번역 게임 방향 — koToJa: 한국어 문장을 보고 일본어로, jaToKo: 일본어 문장을 보고 한국어로. */
export type TranslateDirection = 'koToJa' | 'jaToKo';

export interface TranslateQuestion {
  /** 방향에 따라 한국어 문장(koToJa) 또는 일본어 문장(jaToKo). */
  sourceSentence: string;
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

/**
 * 일기 쓰기의 첨삭 결과 — 정답/오답이 아니라 "더 자연스러운 버전 + 왜 고쳤는지 설명"인 첨삭
 * 방식이다(TranslateGradeResult의 isCorrect 같은 이분법 판정이 없음).
 */
export interface DiaryCorrectionResult {
  correctedText: string; // 문법/표현을 다듬은 버전 전체(사용자가 쓴 것과 같은 길이/구조 유지)
  feedback: string; // 한국어로 된 첨삭 설명 — 뭘 왜 고쳤는지, 잘 쓴 부분 칭찬 등
  originalTranslation: string; // 사용자가 쓴 원문 그대로의 한국어 번역
  correctedTranslation: string; // correctedText의 한국어 번역(교정으로 뉘앙스가 바뀌었으면 다를 수 있음)
  impression: string; // 문법 얘기가 아니라 일기 "내용"에 대한 AI의 감상/반응 (한국어, 친구처럼 캐주얼하게)
}

/**
 * 단어장 맞추기의 "AI 활용형 출제" — 사전형(word) 대신 AI가 자연스러운 활용/파생형을 하나
 * 만들어서 그걸로 문제를 낸다(飲む → 飲みすぎる, 食べる → 食べたい 등). 문법 노트를 참고해서
 * 만들기 때문에, 사용자가 지금 배우고 있는 문형 위주로 나오게 할 수 있다.
 */
export interface WordVariation {
  kanji: string; // 활용된 한자 표기(한자가 없는 단어는 활용된 읽기와 동일한 값)
  reading: string; // 활용된 읽기(히라가나)
  meaning: string; // 활용형의 한국어 뜻
  note: string; // 어떤 문형을 썼는지 짧은 설명 (예: "-すぎる (너무 ~하다)")
}
