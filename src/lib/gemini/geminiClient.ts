// Gemini API 연동 레이어 — 공식 @google/genai SDK 사용
// API 키는 드라이브 config.json에서 로드된 값을 호출부에서 인자로 전달받아 사용한다.
//
// 참고: 2026-08 기준 특정 프로젝트에서 "Your project has been denied access" 403 에러가
// 계정/결제 유형과 무관하게 발생하는 이슈가 있어(구글 쪽 알려진 문제), 그동안은
// lib/claude/claudeClient.ts를 기본으로 쓰고 있음. 이 파일은 문제가 풀리면 바로 다시 쓸 수 있게 유지.

import { GoogleGenAI, Type } from '@google/genai';
import type {
  DiaryCorrectionResult,
  FillBlankQuestion,
  TranslateDirection,
  TranslateGradeResult,
  WordEntry,
  WordRecallGradeResult,
  WordVariation,
} from '../../types';

// 기본 모델명. 사용자가 온보딩에서 직접 모델을 지정하면(config.geminiModel) 그 값을 대신 쓴다.
// 실제로 안 되면 https://ai.google.dev/api/models 에서 최신 모델명을 확인할 것.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';

function client(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

async function generateJson(
  apiKey: string,
  prompt: string,
  responseSchema: Record<string, unknown>,
  model: string = DEFAULT_GEMINI_MODEL
): Promise<unknown> {
  const ai = client(apiKey);
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  const text = response.text;
  if (!text) throw new Error('Gemini 응답이 비어있습니다.');

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Gemini 응답을 JSON으로 해석하지 못했습니다.');
  }
}

/**
 * 예문을 생성한다. word를 주면 그 단어로 빈칸을 만들고,
 * word가 없으면 AI가 학습 컨텍스트에 맞는 단어까지 직접 골라 생성한다.
 */
export async function generateFillBlankQuestion(
  apiKey: string,
  word: WordEntry | undefined,
  contextSummary: string,
  model?: string
): Promise<FillBlankQuestion> {
  if (word) {
    // 한자 표기가 없는 단어(たくさん 등)는 kanji 대신 reading을 빈칸의 정답 문자열로 쓴다.
    const answerText = word.kanji.trim() || word.reading;
    const noKanjiNote = word.kanji.trim()
      ? ''
      : `\n참고: 이 단어는 한자 표기가 없는 단어라 정답 문자열이 히라가나/가타카나(${answerText})입니다.
그대로 두고, 다른 한자로 바꿔쓰지 마세요.`;
    const prompt = `당신은 일본어 학습 앱의 문제 출제자입니다.
다음 단어를 사용한 자연스러운 일본어 예문을 하나 만들어주세요.

단어: ${answerText} — 뜻: ${word.meaning}, JLPT 레벨: ${word.jlptLevel ?? '미지정'}${noKanjiNote}
학습자 상황: ${contextSummary || '특별한 학습 이력 없음'}

요구사항:
- 예문 안에 "${answerText}"라는 문자열이 그대로(부분만 잘리지 않고 전체가) 자연스럽게
  등장해야 하며, 그 부분을 정확히 "___"로 치환해 표시할 것.
  잘못된 예: 정답이 "日本人"인데 "隣のテーブルの人が"처럼 다른 단어("人")의 일부만
  빈칸으로 만들고 그걸 정답인 척하는 것 — 이런 식으로 단어를 쪼개거나, 단어의 글자가
  우연히 다른 곳에 흩어져 있는 걸 정답 취급하면 절대 안 됨. "${answerText}"라는
  글자 뭉치가 문장에 실제로 이어져서 나와야 함
- 매우 중요: "${answerText}"는 활용하지 말고 사전형(원형) 그대로 문장에 넣을 것. 동사/형용사처럼
  활용되는 품사라면, 사전형이 자연스럽게 오는 문형을 골라서 쓸 것 — 예: 〜ことにする, 〜ことが
  できる, 〜前に, 〜つもりだ, 〜ように, 〜という, 또는 명사를 수식하는 자리(사전형+명사)처럼
  사전형 뒤에 오는 구조. "食べました/食べています"처럼 활용해서 "${answerText}"라는 글자
  뭉치가 문장에 그대로 안 보이게 되는 건 절대 안 됨 — 활용형으로 바꾸느니 사전형이 자연스럽게
  들어가는 다른 문형/상황을 고를 것
- 예문은 JLPT 레벨에 맞는 난이도로 작성할 것
- 실제 일상 대화나 상황에서 쓸 법한 자연스럽고 구체적인 문장으로 작성할 것.
  "私は___です" 같은 밋밋하고 뻔한 정의문/공식 틀은 피할 것 — 시간, 장소, 인물,
  이유 등 구체적인 맥락이 담긴 문장이 좋음
- 문장은 한 개만 작성할 것
- translation: 그 예문 전체를(빈칸 부분까지 포함해서, 즉 정답 단어가 채워진 완성된 문장 기준으로)
  자연스러운 한국어로 번역할 것. 답 확인할 때 학습자에게 보여줄 해석이라 정확하고 자연스러워야 함`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        sentence: { type: Type.STRING, description: '빈칸이 ___ 로 표시된 일본어 예문' },
        translation: { type: Type.STRING, description: '예문 전체의 한국어 해석' },
      },
      required: ['sentence', 'translation'],
    };

    const result = (await generateJson(apiKey, prompt, schema, model)) as {
      sentence: string;
      translation: string;
    };
    return { sentence: result.sentence, targetWord: word, translation: result.translation };
  }

  const prompt = `당신은 일본어 학습 앱의 문제 출제자입니다.
학습자에게 적절한 일본어 단어를 하나 직접 고르고, 그 단어를 사용한 자연스러운 예문을 만들어주세요.

학습자 상황: ${contextSummary || '특별한 학습 이력 없음 — 기초(N5~N4) 수준으로 골라주세요'}

요구사항:
- kanji: 정답 표기 (한자 또는 한자+오쿠리가나, 예: 食べる)
- reading: 전체 읽는 법 (히라가나)
- meaning: 한국어 뜻
- jlptLevel: N5/N4/N3/N2/N1 중 하나
- sentence: 예문에서 정답(kanji)에 해당하는 부분을 정확히 "___"로 치환해 표시
- 매우 중요: "___" 자리를 kanji 필드 값으로 그대로 채웠을 때 문장이 문법적으로 완성돼야 합니다.
  동사를 활용형(예: ~ます체)으로 쓰고 싶다면 kanji 필드도 사전형이 아니라 그 활용된 형태
  그대로 적어주세요 (예: 문장이 "___みます"라면 kanji는 "飲み"가 아니라 "飲みます"까지
  포함하거나, 아예 문장을 "___ます"로 만들고 kanji를 "飲み"로 맞추는 식으로 정확히 일치시킬 것)
- 실제 일상 대화나 상황에서 쓸 법한 자연스럽고 구체적인 문장으로 작성할 것.
  "私は___です" 같은 밋밋하고 뻔한 정의문/공식 틀은 피할 것 — 시간, 장소, 인물,
  이유 등 구체적인 맥락이 담긴 문장이 좋음
- 문장은 한 개만 작성
- translation: 그 예문 전체를(빈칸이 정답으로 채워진 완성된 문장 기준으로) 자연스러운 한국어로
  번역할 것. 답 확인할 때 학습자에게 보여줄 해석이라 정확하고 자연스러워야 함`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      kanji: { type: Type.STRING },
      reading: { type: Type.STRING },
      meaning: { type: Type.STRING },
      jlptLevel: { type: Type.STRING, enum: ['N5', 'N4', 'N3', 'N2', 'N1'] },
      sentence: { type: Type.STRING },
      translation: { type: Type.STRING, description: '예문 전체의 한국어 해석' },
    },
    required: ['kanji', 'reading', 'meaning', 'jlptLevel', 'sentence', 'translation'],
  };

  const result = (await generateJson(apiKey, prompt, schema, model)) as {
    kanji: string;
    reading: string;
    meaning: string;
    jlptLevel: WordEntry['jlptLevel'];
    sentence: string;
    translation: string;
  };

  return {
    sentence: result.sentence,
    targetWord: {
      // 단어장 없이 AI가 즉석에서 만든 단어라 소속 단어장(따라서 진도를 되써넣을 CSV 파일도)이
      // 없다 — 실제로 이 단어는 wordBank.words에 없어서 진도가 기록되지도 않는다(FillBlankGamePage의
      // tracked 체크 참고). bankName/fileId는 타입만 채우는 자리표시자.
      id: `ai::${result.kanji}_${result.reading}`,
      bankName: 'ai',
      fileId: '',
      kanji: result.kanji,
      reading: result.reading,
      meaning: result.meaning,
      jlptLevel: result.jlptLevel,
    },
    translation: result.translation,
  };
}

/**
 * 학습 컨텍스트를 바탕으로 번역 게임용 문장을 생성한다 — direction이 koToJa면 한국어 문장(학습자가
 * 일본어로 번역), jaToKo면 일본어 문장(학습자가 한국어로 번역)을 만든다.
 * words를 주면 그 단어들이 전부 자연스럽게 들어가는 문장을 만들어서, 번역하면 그 단어들을
 * 실제로 쓰게/마주치게 유도한다 (한 문제에 2~7개 — 문장 난이도를 위해 개수는 호출부에서 정해서 넘긴다).
 */
export async function generateTranslateQuestion(
  apiKey: string,
  contextSummary: string,
  direction: TranslateDirection,
  words?: WordEntry[],
  model?: string
): Promise<{ sourceSentence: string }> {
  const wordRequirement =
    words && words.length > 0
      ? direction === 'koToJa'
        ? `- 아래 단어들의 뜻을 참고해서 자연스러운 상황 하나를 떠올리고 문장을 쓸 것 — 단어를 나열하듯
  이어붙이지 말고, 하나의 자연스러운 장면/문맥이어야 함. 자연스러움이 단어 개수보다 훨씬 중요하니,
  전부 다 넣으려다 문장이 어색해질 것 같으면 일부는 과감히 빼도 됨(억지로 욱여넣은 티가 나는
  문장은 안 됨):
  ${words.map((w) => `"${w.meaning}"(일본어로는 ${w.kanji.trim() ? `${w.kanji}/${w.reading}` : w.reading})`).join(', ')}`
        : `- 아래 단어들을(한자/읽기 그대로) 참고해서 자연스러운 상황 하나를 떠올리고 문장을 쓸 것 —
  단어를 나열하듯 이어붙이지 말고, 하나의 자연스러운 장면/문맥이어야 함. 자연스러움이 단어
  개수보다 훨씬 중요하니, 전부 다 넣으려다 문장이 어색해질 것 같으면 일부는 과감히 빼도 됨
  (억지로 욱여넣은 티가 나는 문장은 안 됨):
  ${words.map((w) => (w.kanji.trim() ? `${w.kanji}(${w.reading})` : w.reading) + `— 뜻: ${w.meaning}`).join(', ')}`
      : '';

  const prompt =
    direction === 'koToJa'
      ? `당신은 일본어 학습 앱의 문제 출제자입니다.
한국어 문장 하나를 만들어주세요. 학습자가 이 문장을 일본어로 번역하는 연습을 할 거예요.

학습자 상황: ${contextSummary || '특별한 학습 이력 없음'}

요구사항:
- 일상 대화에서 쓸 법한 자연스러운 한국어 문장
- 학습자 수준에 맞는 문법/어휘 난이도
${wordRequirement}
- 한 문장만 작성
- 결과는 sourceSentence 필드 하나에 그 한국어 문장을 담을 것`
      : `당신은 일본어 학습 앱의 문제 출제자입니다.
일본어 문장 하나를 만들어주세요. 학습자가 이 문장을 한국어로 번역하는 연습을 할 거예요.

학습자 상황: ${contextSummary || '특별한 학습 이력 없음'}

요구사항:
- 일상 대화에서 쓸 법한 자연스러운 일본어 문장, 상용한자 위주로 표기
- 학습자 수준에 맞는 문법/어휘 난이도
${wordRequirement}
- 한 문장만 작성
- 결과는 sourceSentence 필드 하나에 그 일본어 문장을 담을 것`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      sourceSentence: { type: Type.STRING },
    },
    required: ['sourceSentence'],
  };

  return (await generateJson(apiKey, prompt, schema, model)) as { sourceSentence: string };
}

/** 사용자의 번역이 원문 의미를 잘 전달하는지 채점한다 — direction으로 원문/번역 언어가 갈린다. */
export async function gradeTranslation(
  apiKey: string,
  direction: TranslateDirection,
  sourceSentence: string,
  userAnswer: string,
  model?: string
): Promise<TranslateGradeResult> {
  const prompt =
    direction === 'koToJa'
      ? `당신은 일본어 학습 앱의 채점자입니다.
아래 한국어 문장을 사용자가 일본어로 번역했습니다. 의미와 문법을 기준으로 채점해주세요.
어순이나 표현이 정답과 다르더라도 의미가 통하고 문법이 맞으면 정답으로 처리하세요.

원문(한국어): ${sourceSentence}
사용자 번역(일본어): ${userAnswer}

요구사항:
- isCorrect: 의미가 통하고 문법이 자연스러우면 true, 아니면 false
- feedback: 한국어로 1~2문장. 틀렸다면 어디가 왜 틀렸는지, 맞았다면 짧게 칭찬`
      : `당신은 일본어 학습 앱의 채점자입니다.
아래 일본어 문장을 사용자가 한국어로 번역했습니다. 의미를 기준으로 채점해주세요.
어순이나 표현이 정답과 다르더라도 의미가 통하면 정답으로 처리하세요(맞춤법은 너그럽게 볼 것).

원문(일본어): ${sourceSentence}
사용자 번역(한국어): ${userAnswer}

요구사항:
- isCorrect: 의미가 잘 통하면 true, 아니면 false
- feedback: 한국어로 1~2문장. 틀렸다면 어디가 왜 틀렸는지, 맞았다면 짧게 칭찬`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      isCorrect: { type: Type.BOOLEAN },
      feedback: { type: Type.STRING },
    },
    required: ['isCorrect', 'feedback'],
  };

  return (await generateJson(apiKey, prompt, schema, model)) as TranslateGradeResult;
}

/**
 * 단어장 맞추기 "한자 → 읽기/뜻" 방향 채점. 정답 읽기/뜻은 이미 단어장 데이터로 알고 있지만,
 * 오탈자나 동의어 표현까지 유연하게 받아주기 위해 문자열 비교 대신 AI로 채점한다.
 */
export async function gradeWordRecall(
  apiKey: string,
  word: WordEntry,
  userReading: string,
  userMeaning: string,
  model?: string
): Promise<WordRecallGradeResult> {
  const prompt = `당신은 일본어 학습 앱의 채점자입니다.
아래 단어를 보고 사용자가 읽기(히라가나)와 뜻(한국어)을 답했습니다. 각각 채점해주세요.

${word.kanji.trim() ? `한자: ${word.kanji}` : '이 단어는 한자 표기가 없는 단어입니다.'}
정답 읽기: ${word.reading}
정답 뜻: ${word.meaning}
사용자가 입력한 읽기: ${userReading || '(입력 안 함)'}
사용자가 입력한 뜻: ${userMeaning || '(입력 안 함)'}

요구사항:
- readingCorrect: 읽기가 정답과 실질적으로 같으면(사소한 표기 차이는 허용) true, 아니면 false
- meaningCorrect: 뜻이 정답과 의미가 통하면(다른 표현/동의어여도 같은 뜻이면) true, 명백히 다르거나
  안 썼으면 false
- feedback: 한국어로 1~2문장. 읽기/뜻 중 틀린 게 있으면 무엇이 왜 틀렸는지 짚어주고, 둘 다
  맞았으면 짧게 칭찬`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      readingCorrect: { type: Type.BOOLEAN },
      meaningCorrect: { type: Type.BOOLEAN },
      feedback: { type: Type.STRING },
    },
    required: ['readingCorrect', 'meaningCorrect', 'feedback'],
  };

  return (await generateJson(apiKey, prompt, schema, model)) as WordRecallGradeResult;
}

/**
 * 단어장 맞추기의 "AI 활용형 출제"용 — 사전형(word) 대신 자연스러운 활용/파생형을 하나 만든다
 * (飲む → 飲みすぎる, 食べる → 食べたい 등). grammarNotes(사용자가 grammar/ 폴더에서 고른 문법
 * 노트)를 참고해서, 거기 나온 문형이 이 단어에 적용 가능하면 그걸 우선 쓴다.
 */
export async function generateWordVariation(
  apiKey: string,
  word: WordEntry,
  grammarNotes: string,
  model?: string
): Promise<WordVariation> {
  const wordHasKanji = word.kanji.trim() !== '';
  const prompt = `당신은 일본어 학습 앱의 문제 출제자입니다.
아래 사전형 단어를 자연스러운 활용형/파생형 하나로 바꿔주세요 — 예: 飲む → 飲みすぎる(-すぎる),
食べる → 食べたい(-たい), 高い → 高くなかった(과거부정형), 怒る → 怒られる(수동형/受け身) 등.

사전형 단어: ${wordHasKanji ? `${word.kanji}(${word.reading})` : word.reading} — 뜻: ${word.meaning}
${grammarNotes ? `학습자가 지금 공부 중인 문법 노트(가능하면 여기 나온 문형을 우선 활용):\n${grammarNotes}` : '학습자 문법 노트 없음 — 흔한 활용형(ます형/て형/たい형/ない형/た형/가능형/의지형/수동형(受け身)/〜すぎる/〜てみる 등) 중 자연스러운 걸 고를 것 — 동사라면 수동형도 이따금 섞어서 낼 것'}

요구사항:
- kanji: 활용된 형태의 한자 표기. ${wordHasKanji ? '반드시 원래 단어의 한자를 포함해서 자연스러운 오쿠리가나로 적을 것(예: 食べたい, 飲みすぎる)' : '이 단어는 한자 표기가 없는 단어이니 반드시 빈 문자열("")로 둘 것'}
- reading: 활용된 형태 전체의 읽기(히라가나)
- meaning: 그 활용형의 한국어 뜻 (예: "먹고 싶다", "너무 마시다")
- note: 어떤 문형을 썼는지 아주 짧은 한국어 설명 (예: "-たい (~하고 싶다)")
- 이 단어의 품사상 자연스럽게 활용이 안 되는 경우(순수 명사 등)에는 원형을 그대로 두고
  note에 "활용 없음"이라고 적을 것
- 결과 문자열에 사전형 원문이 아니라 반드시 활용된 형태가 들어가야 함`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      kanji: { type: Type.STRING },
      reading: { type: Type.STRING },
      meaning: { type: Type.STRING },
      note: { type: Type.STRING },
    },
    required: ['kanji', 'reading', 'meaning', 'note'],
  };

  const result = (await generateJson(apiKey, prompt, schema, model)) as WordVariation;
  // 한자 없는 단어는 활용형도 한자가 생기면 안 된다(단어장 전체의 "한자 없는 단어" 규칙과
  // 일관성을 맞추기 위해) — AI가 실수로 채워도 여기서 강제로 비운다.
  return wordHasKanji ? result : { ...result, kanji: '' };
}

/**
 * 일기 쓰기용 오늘의 주제를 하나 만든다 — "오늘 뭘 했는지" 류의 자유 작문 주제. suggestedWords를
 * 주면 그 단어들을 쓰면 좋을 만한 방향으로 주제를 살짝 유도하되, 억지로 다 쓰라고 요구하지는
 * 않는다(자유 작문이 핵심이라 강제하면 일기가 아니라 번역 문제가 돼버림).
 */
export async function generateDiaryTopic(
  apiKey: string,
  contextSummary: string,
  suggestedWords?: WordEntry[],
  model?: string
): Promise<{ topic: string }> {
  const wordHint =
    suggestedWords && suggestedWords.length > 0
      ? `\n참고: 아래 단어를 쓰면 자연스러울 만한 주제면 좋지만, 강제는 아님(안 써도 전혀 상관없음):\n${suggestedWords
          .map((w) => (w.kanji.trim() ? `${w.kanji}(${w.reading})` : w.reading) + ` — ${w.meaning}`)
          .join(', ')}`
      : '';

  const prompt = `당신은 일본어 학습 앱의 일기 쓰기 코너 진행자입니다.
학습자가 일본어로 짧은 일기(3~5문장 정도)를 자유롭게 쓸 수 있게, 오늘의 주제/질문을 하나
한국어로 던져주세요. "오늘 뭘 했는지", "요즘 관심사", "이번 주말 계획" 같은 일상적이고 부담 없는
주제로, 매번 다르게 다양한 걸 골라주세요.

학습자 상황: ${contextSummary || '특별한 학습 이력 없음'}${wordHint}

요구사항:
- topic: 한국어 한두 문장. 질문 형태로("오늘 아침에 뭘 먹었는지 써보세요" 등) 구체적으로 던질 것
- 너무 무겁거나 추상적인 주제는 피하고, 일상 소재로`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      topic: { type: Type.STRING },
    },
    required: ['topic'],
  };

  return (await generateJson(apiKey, prompt, schema, model)) as { topic: string };
}

/**
 * 사용자가 자유롭게 쓴 일본어 일기를 첨삭한다 — 정답/오답이 아니라 "더 자연스러운 버전 +
 * 왜 고쳤는지" 방식. 문법이 이미 맞고 자연스러우면 correctedText는 원문과 거의 같아도 된다.
 */
export async function correctDiaryEntry(
  apiKey: string,
  topic: string,
  entryText: string,
  contextSummary: string,
  model?: string
): Promise<DiaryCorrectionResult> {
  const prompt = `당신은 일본어 학습 앱의 작문 첨삭 선생님이자, 일기를 읽어주는 다정한 친구입니다.
학습자가 아래 주제로 일본어 일기를 썼습니다.

주제: ${topic}
학습자 상황: ${contextSummary || '특별한 학습 이력 없음'}
학습자가 쓴 일본어: ${entryText}

요구사항:
- correctedText: 문법 오류를 고치고 어색한 표현을 자연스럽게 다듬은 전체 버전. 학습자의 원래
  내용/구조/길이는 최대한 유지할 것(완전히 다른 문장으로 바꾸지 말고, 필요한 부분만 손볼 것).
  이미 자연스러운 문장이면 그대로 둘 것.
- feedback: 한국어로 2~4문장. 뭘 왜 고쳤는지 구체적으로(문법 관점에서) 짚어주고, 잘 쓴 부분이
  있으면 칭찬도 같이 해줄 것. 고칠 게 하나도 없으면 그렇다고 칭찬으로 말해줄 것.
- originalTranslation: 학습자가 쓴 원문(entryText) 그대로를 자연스러운 한국어로 번역한 것.
  문법이 틀린 부분이 있어도 의도를 최대한 살려서 번역할 것.
- correctedTranslation: correctedText를 자연스러운 한국어로 번역한 것. originalTranslation과
  뜻이 같으면 똑같이 적어도 되고, 교정으로 뉘앙스가 달라졌으면 그 차이를 반영할 것.
- impression: 문법 얘기가 아니라 일기 "내용" 자체에 대한 짧은 감상/반응(한국어 2~3문장). 친구가
  일기를 읽고 반응해주듯 캐주얼하고 다정한 톤으로 — 공감하거나, 재밌어하거나, 궁금한 걸
  되묻거나 해도 좋음. 첨삭 피드백(feedback)과 겹치지 않게, 순수하게 내용에 대한 반응만.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      correctedText: { type: Type.STRING },
      feedback: { type: Type.STRING },
      originalTranslation: { type: Type.STRING },
      correctedTranslation: { type: Type.STRING },
      impression: { type: Type.STRING },
    },
    required: ['correctedText', 'feedback', 'originalTranslation', 'correctedTranslation', 'impression'],
  };

  return (await generateJson(apiKey, prompt, schema, model)) as DiaryCorrectionResult;
}
