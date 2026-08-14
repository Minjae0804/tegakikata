// Gemini API 연동 레이어 — 공식 @google/genai SDK 사용
// API 키는 드라이브 config.json에서 로드된 값을 호출부에서 인자로 전달받아 사용한다.
//
// 참고: 2026-08 기준 특정 프로젝트에서 "Your project has been denied access" 403 에러가
// 계정/결제 유형과 무관하게 발생하는 이슈가 있어(구글 쪽 알려진 문제), 그동안은
// lib/claude/claudeClient.ts를 기본으로 쓰고 있음. 이 파일은 문제가 풀리면 바로 다시 쓸 수 있게 유지.

import { GoogleGenAI, Type } from '@google/genai';
import type { FillBlankQuestion, TranslateGradeResult, WordEntry, WordRecallGradeResult } from '../../types';

// 모델명은 Gemini 쪽에서 종종 바뀌므로, 실제로 안 되면 https://ai.google.dev/api/models 에서
// 최신 모델명을 확인해 이 상수만 바꾸면 된다.
const GEMINI_MODEL = 'gemini-3.6-flash';

function client(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

async function generateJson(
  apiKey: string,
  prompt: string,
  responseSchema: Record<string, unknown>
): Promise<unknown> {
  const ai = client(apiKey);
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
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
  contextSummary: string
): Promise<FillBlankQuestion> {
  if (word) {
    const prompt = `당신은 일본어 학습 앱의 문제 출제자입니다.
다음 단어를 사용한 자연스러운 일본어 예문을 하나 만들어주세요.

단어: ${word.kanji}(${word.reading}) — 뜻: ${word.meaning}, JLPT 레벨: ${word.jlptLevel ?? '미지정'}
학습자 상황: ${contextSummary || '특별한 학습 이력 없음'}

요구사항:
- 예문 안에 "${word.kanji}"라는 문자열이 그대로(부분만 잘리지 않고 전체가) 자연스럽게
  등장해야 하며, 그 부분을 정확히 "___"로 치환해 표시할 것.
  잘못된 예: 정답이 "日本人"인데 "隣のテーブルの人が"처럼 다른 단어("人")의 일부만
  빈칸으로 만들고 그걸 정답인 척하는 것 — 이런 식으로 단어를 쪼개거나, 단어의 글자가
  우연히 다른 곳에 흩어져 있는 걸 정답 취급하면 절대 안 됨. "${word.kanji}"라는
  글자 뭉치가 문장에 실제로 이어져서 나와야 함
- 예문은 JLPT 레벨에 맞는 난이도로 작성할 것
- 실제 일상 대화나 상황에서 쓸 법한 자연스럽고 구체적인 문장으로 작성할 것.
  "私は___です" 같은 밋밋하고 뻔한 정의문/공식 틀은 피할 것 — 시간, 장소, 인물,
  이유 등 구체적인 맥락이 담긴 문장이 좋음
- 문장은 한 개만 작성할 것`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        sentence: { type: Type.STRING, description: '빈칸이 ___ 로 표시된 일본어 예문' },
      },
      required: ['sentence'],
    };

    const result = (await generateJson(apiKey, prompt, schema)) as { sentence: string };
    return { sentence: result.sentence, targetWord: word };
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
- 문장은 한 개만 작성`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      kanji: { type: Type.STRING },
      reading: { type: Type.STRING },
      meaning: { type: Type.STRING },
      jlptLevel: { type: Type.STRING, enum: ['N5', 'N4', 'N3', 'N2', 'N1'] },
      sentence: { type: Type.STRING },
    },
    required: ['kanji', 'reading', 'meaning', 'jlptLevel', 'sentence'],
  };

  const result = (await generateJson(apiKey, prompt, schema)) as {
    kanji: string;
    reading: string;
    meaning: string;
    jlptLevel: WordEntry['jlptLevel'];
    sentence: string;
  };

  return {
    sentence: result.sentence,
    targetWord: {
      id: `ai_${result.kanji}_${result.reading}`,
      kanji: result.kanji,
      reading: result.reading,
      meaning: result.meaning,
      jlptLevel: result.jlptLevel,
    },
  };
}

/** 학습 컨텍스트를 바탕으로 번역 게임용 한국어 문장을 생성한다. */
export async function generateTranslateQuestion(
  apiKey: string,
  contextSummary: string
): Promise<{ koreanSentence: string }> {
  const prompt = `당신은 일본어 학습 앱의 문제 출제자입니다.
한국어 문장 하나를 만들어주세요. 학습자가 이 문장을 일본어로 번역하는 연습을 할 거예요.

학습자 상황: ${contextSummary || '특별한 학습 이력 없음'}

요구사항:
- 일상 대화에서 쓸 법한 자연스러운 한국어 문장
- 학습자 수준에 맞는 문법/어휘 난이도
- 한 문장만 작성`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      koreanSentence: { type: Type.STRING },
    },
    required: ['koreanSentence'],
  };

  return (await generateJson(apiKey, prompt, schema)) as { koreanSentence: string };
}

/** 사용자의 일본어 번역이 원문 의미를 잘 전달하는지 채점한다. */
export async function gradeTranslation(
  apiKey: string,
  koreanSentence: string,
  userAnswer: string
): Promise<TranslateGradeResult> {
  const prompt = `당신은 일본어 학습 앱의 채점자입니다.
아래 한국어 문장을 사용자가 일본어로 번역했습니다. 의미와 문법을 기준으로 채점해주세요.
어순이나 표현이 정답과 다르더라도 의미가 통하고 문법이 맞으면 정답으로 처리하세요.

원문(한국어): ${koreanSentence}
사용자 번역(일본어): ${userAnswer}

요구사항:
- isCorrect: 의미가 통하고 문법이 자연스러우면 true, 아니면 false
- feedback: 한국어로 1~2문장. 틀렸다면 어디가 왜 틀렸는지, 맞았다면 짧게 칭찬`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      isCorrect: { type: Type.BOOLEAN },
      feedback: { type: Type.STRING },
    },
    required: ['isCorrect', 'feedback'],
  };

  return (await generateJson(apiKey, prompt, schema)) as TranslateGradeResult;
}

/**
 * 단어장 맞추기 "한자 → 읽기/뜻" 방향 채점. 정답 읽기/뜻은 이미 단어장 데이터로 알고 있지만,
 * 오탈자나 동의어 표현까지 유연하게 받아주기 위해 문자열 비교 대신 AI로 채점한다.
 */
export async function gradeWordRecall(
  apiKey: string,
  word: WordEntry,
  userReading: string,
  userMeaning: string
): Promise<WordRecallGradeResult> {
  const prompt = `당신은 일본어 학습 앱의 채점자입니다.
아래 한자 단어를 보고 사용자가 읽기(히라가나)와 뜻(한국어)을 답했습니다. 각각 채점해주세요.

한자: ${word.kanji}
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

  return (await generateJson(apiKey, prompt, schema)) as WordRecallGradeResult;
}
