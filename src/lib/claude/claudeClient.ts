// Claude API 연동 레이어 — 공식 @anthropic-ai/sdk 사용 (Gemini 프로젝트 접근 문제로 교체)
// 브라우저에서 직접 호출하기 위해 dangerouslyAllowBrowser: true를 사용한다.
// API 키는 드라이브 config.json에서 로드된 값을 호출부에서 인자로 전달받아 사용한다.

import Anthropic from '@anthropic-ai/sdk';
import type { FillBlankQuestion, TranslateGradeResult, WordEntry } from '../../types';

// 모델명은 종종 바뀌므로, 실제로 안 되면 https://docs.claude.com/en/docs/about-claude/models 에서
// 최신 모델명을 확인해 이 상수만 바꾸면 된다.
// Haiku는 Sonnet/Opus보다 훨씬 저렴하고 빨라서, 예문 생성/채점처럼 가벼운 작업엔 충분하다.
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

function client(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/**
 * tool use를 강제해서 구조화된 JSON 출력을 안정적으로 받는다.
 * (Claude는 Gemini의 responseSchema 같은 내장 JSON 모드가 없어서, 툴 호출을 그 용도로 활용한다)
 */
async function generateStructured<T>(
  apiKey: string,
  prompt: string,
  toolInputSchema: Record<string, unknown>
): Promise<T> {
  const ai = client(apiKey);
  const response = await ai.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
    tools: [
      {
        name: 'output',
        description: '요청받은 결과를 구조화된 형태로 반환한다.',
        input_schema: { type: 'object', ...toolInputSchema },
      },
    ],
    tool_choice: { type: 'tool', name: 'output' },
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude 응답에서 결과를 찾지 못했습니다.');
  }

  return toolUse.input as T;
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
      properties: {
        sentence: { type: 'string', description: '빈칸이 ___ 로 표시된 일본어 예문' },
      },
      required: ['sentence'],
    };

    const result = await generateStructured<{ sentence: string }>(apiKey, prompt, schema);
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
    properties: {
      kanji: { type: 'string' },
      reading: { type: 'string' },
      meaning: { type: 'string' },
      jlptLevel: { type: 'string', enum: ['N5', 'N4', 'N3', 'N2', 'N1'] },
      sentence: { type: 'string' },
    },
    required: ['kanji', 'reading', 'meaning', 'jlptLevel', 'sentence'],
  };

  const result = await generateStructured<{
    kanji: string;
    reading: string;
    meaning: string;
    jlptLevel: WordEntry['jlptLevel'];
    sentence: string;
  }>(apiKey, prompt, schema);

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
    properties: {
      koreanSentence: { type: 'string' },
    },
    required: ['koreanSentence'],
  };

  return generateStructured<{ koreanSentence: string }>(apiKey, prompt, schema);
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
    properties: {
      isCorrect: { type: 'boolean' },
      feedback: { type: 'string' },
    },
    required: ['isCorrect', 'feedback'],
  };

  return generateStructured<TranslateGradeResult>(apiKey, prompt, schema);
}
