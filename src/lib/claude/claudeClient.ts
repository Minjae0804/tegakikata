// Claude API 연동 레이어 — 공식 @anthropic-ai/sdk 사용 (Gemini 프로젝트 접근 문제로 교체)
// 브라우저에서 직접 호출하기 위해 dangerouslyAllowBrowser: true를 사용한다.
// API 키는 드라이브 config.json에서 로드된 값을 호출부에서 인자로 전달받아 사용한다.

import Anthropic from '@anthropic-ai/sdk';
import type { FillBlankQuestion, TranslateGradeResult, WordEntry, WordRecallGradeResult, WordVariation } from '../../types';

// 기본 모델명. 사용자가 온보딩에서 직접 모델을 지정하면(config.claudeModel) 그 값을 대신 쓴다.
// Haiku는 Sonnet/Opus보다 훨씬 저렴하고 빨라서, 예문 생성/채점처럼 가벼운 작업엔 충분하다.
export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

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
  toolInputSchema: Record<string, unknown>,
  model: string = DEFAULT_CLAUDE_MODEL
): Promise<T> {
  const ai = client(apiKey);
  const response = await ai.messages.create({
    model,
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
      properties: {
        sentence: { type: 'string', description: '빈칸이 ___ 로 표시된 일본어 예문' },
        translation: { type: 'string', description: '예문 전체의 한국어 해석' },
      },
      required: ['sentence', 'translation'],
    };

    const result = await generateStructured<{ sentence: string; translation: string }>(
      apiKey,
      prompt,
      schema,
      model
    );
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
    properties: {
      kanji: { type: 'string' },
      reading: { type: 'string' },
      meaning: { type: 'string' },
      jlptLevel: { type: 'string', enum: ['N5', 'N4', 'N3', 'N2', 'N1'] },
      sentence: { type: 'string' },
      translation: { type: 'string', description: '예문 전체의 한국어 해석' },
    },
    required: ['kanji', 'reading', 'meaning', 'jlptLevel', 'sentence', 'translation'],
  };

  const result = await generateStructured<{
    kanji: string;
    reading: string;
    meaning: string;
    jlptLevel: WordEntry['jlptLevel'];
    sentence: string;
    translation: string;
  }>(apiKey, prompt, schema, model);

  return {
    sentence: result.sentence,
    targetWord: {
      // 단어장 없이 AI가 즉석에서 만든 단어라 소속 단어장이 없다 — "ai"라는 가상 단어장 하나로
      // 묶어서 진도를 저장한다(그래야 매번 다른 단어마다 저장 파일이 따로 안 생긴다).
      id: `ai::${result.kanji}_${result.reading}`,
      bankName: 'ai',
      kanji: result.kanji,
      reading: result.reading,
      meaning: result.meaning,
      jlptLevel: result.jlptLevel,
    },
    translation: result.translation,
  };
}

/**
 * 학습 컨텍스트를 바탕으로 번역 게임용 한국어 문장을 생성한다.
 * words를 주면 그 단어들의 뜻이 전부 자연스럽게 들어가는 문장을 만들어서, 번역하면 그 단어들을
 * 쓰게 유도한다 (한 문제에 2~7개 — 문장 난이도를 위해 개수는 호출부에서 정해서 넘긴다).
 */
export async function generateTranslateQuestion(
  apiKey: string,
  contextSummary: string,
  words?: WordEntry[],
  model?: string
): Promise<{ koreanSentence: string }> {
  const wordRequirement =
    words && words.length > 0
      ? `- 문장 안에 다음 단어들의 뜻이 전부 자연스럽게 들어가야 함. 번역할 때 학습자가 이 단어들을
  실제로 쓰게 되는 문장이어야 함(억지로 다 우겨넣어서 문장이 부자연스러워지면 안 되고, 자연스럽게
  하나의 상황/문맥으로 엮을 것):
  ${words.map((w) => `"${w.meaning}"(일본어로는 ${w.kanji.trim() ? `${w.kanji}/${w.reading}` : w.reading})`).join(', ')}`
      : '';

  const prompt = `당신은 일본어 학습 앱의 문제 출제자입니다.
한국어 문장 하나를 만들어주세요. 학습자가 이 문장을 일본어로 번역하는 연습을 할 거예요.

학습자 상황: ${contextSummary || '특별한 학습 이력 없음'}

요구사항:
- 일상 대화에서 쓸 법한 자연스러운 한국어 문장
- 학습자 수준에 맞는 문법/어휘 난이도
${wordRequirement}
- 한 문장만 작성`;

  const schema = {
    properties: {
      koreanSentence: { type: 'string' },
    },
    required: ['koreanSentence'],
  };

  return generateStructured<{ koreanSentence: string }>(apiKey, prompt, schema, model);
}

/** 사용자의 일본어 번역이 원문 의미를 잘 전달하는지 채점한다. */
export async function gradeTranslation(
  apiKey: string,
  koreanSentence: string,
  userAnswer: string,
  model?: string
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

  return generateStructured<TranslateGradeResult>(apiKey, prompt, schema, model);
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
    properties: {
      readingCorrect: { type: 'boolean' },
      meaningCorrect: { type: 'boolean' },
      feedback: { type: 'string' },
    },
    required: ['readingCorrect', 'meaningCorrect', 'feedback'],
  };

  return generateStructured<WordRecallGradeResult>(apiKey, prompt, schema, model);
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
食べる → 食べたい(-たい), 高い → 高くなかった(과거부정형) 등.

사전형 단어: ${wordHasKanji ? `${word.kanji}(${word.reading})` : word.reading} — 뜻: ${word.meaning}
${grammarNotes ? `학습자가 지금 공부 중인 문법 노트(가능하면 여기 나온 문형을 우선 활용):\n${grammarNotes}` : '학습자 문법 노트 없음 — 흔한 활용형(ます형/て형/たい형/ない형/た형/가능형/의지형/〜すぎる/〜てみる 등) 중 자연스러운 걸 고를 것'}

요구사항:
- kanji: 활용된 형태의 한자 표기. ${wordHasKanji ? '반드시 원래 단어의 한자를 포함해서 자연스러운 오쿠리가나로 적을 것(예: 食べたい, 飲みすぎる)' : '이 단어는 한자 표기가 없는 단어이니 반드시 빈 문자열("")로 둘 것'}
- reading: 활용된 형태 전체의 읽기(히라가나)
- meaning: 그 활용형의 한국어 뜻 (예: "먹고 싶다", "너무 마시다")
- note: 어떤 문형을 썼는지 아주 짧은 한국어 설명 (예: "-たい (~하고 싶다)")
- 이 단어의 품사상 자연스럽게 활용이 안 되는 경우(순수 명사 등)에는 원형을 그대로 두고
  note에 "활용 없음"이라고 적을 것
- 결과 문자열에 사전형 원문이 아니라 반드시 활용된 형태가 들어가야 함`;

  const schema = {
    properties: {
      kanji: { type: 'string' },
      reading: { type: 'string' },
      meaning: { type: 'string' },
      note: { type: 'string' },
    },
    required: ['kanji', 'reading', 'meaning', 'note'],
  };

  const result = await generateStructured<WordVariation>(apiKey, prompt, schema, model);
  // 한자 없는 단어는 활용형도 한자가 생기면 안 된다(단어장 전체의 "한자 없는 단어" 규칙과
  // 일관성을 맞추기 위해) — AI가 실수로 채워도 여기서 강제로 비운다.
  return wordHasKanji ? result : { ...result, kanji: '' };
}
