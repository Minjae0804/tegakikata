// AI 프로바이더 파사드 — 게임 페이지는 이 파일만 보고, 실제로 Gemini/Claude 중
// 뭘 쓰는지는 config.aiProvider에 따라 여기서 알아서 갈라준다.
// (2026-08 기준 Gemini 쪽 프로젝트 접근 이슈로 Claude를 기본값으로 쓰는 중 — 문제가 풀리면
//  config.aiProvider를 'gemini'로 바꾸기만 하면 원상복구됨)

import type { AppConfig, FillBlankQuestion, TranslateGradeResult, WordEntry, WordRecallGradeResult } from '../../types';
import * as gemini from '../gemini/geminiClient';
import * as claude from '../claude/claudeClient';

function resolveApiKey(config: AppConfig): string {
  const key = config.aiProvider === 'gemini' ? config.geminiApiKey : config.claudeApiKey;
  if (!key) {
    throw new Error(
      `${config.aiProvider === 'gemini' ? 'Gemini' : 'Claude'} API 키가 설정되지 않았습니다.`
    );
  }
  return key;
}

/** 사용자가 온보딩에서 직접 모델을 지정했으면 그 값을, 아니면 undefined(각 클라이언트 기본값 사용)를 반환한다. */
function resolveModel(config: AppConfig): string | undefined {
  const model = config.aiProvider === 'gemini' ? config.geminiModel : config.claudeModel;
  return model?.trim() || undefined;
}

export async function generateFillBlankQuestion(
  config: AppConfig,
  word: WordEntry | undefined,
  contextSummary: string
): Promise<FillBlankQuestion> {
  const apiKey = resolveApiKey(config);
  const model = resolveModel(config);
  return config.aiProvider === 'gemini'
    ? gemini.generateFillBlankQuestion(apiKey, word, contextSummary, model)
    : claude.generateFillBlankQuestion(apiKey, word, contextSummary, model);
}

export async function generateTranslateQuestion(
  config: AppConfig,
  contextSummary: string,
  words?: WordEntry[]
): Promise<{ koreanSentence: string }> {
  const apiKey = resolveApiKey(config);
  const model = resolveModel(config);
  return config.aiProvider === 'gemini'
    ? gemini.generateTranslateQuestion(apiKey, contextSummary, words, model)
    : claude.generateTranslateQuestion(apiKey, contextSummary, words, model);
}

export async function gradeTranslation(
  config: AppConfig,
  koreanSentence: string,
  userAnswer: string
): Promise<TranslateGradeResult> {
  const apiKey = resolveApiKey(config);
  const model = resolveModel(config);
  return config.aiProvider === 'gemini'
    ? gemini.gradeTranslation(apiKey, koreanSentence, userAnswer, model)
    : claude.gradeTranslation(apiKey, koreanSentence, userAnswer, model);
}

export async function gradeWordRecall(
  config: AppConfig,
  word: WordEntry,
  userReading: string,
  userMeaning: string
): Promise<WordRecallGradeResult> {
  const apiKey = resolveApiKey(config);
  const model = resolveModel(config);
  return config.aiProvider === 'gemini'
    ? gemini.gradeWordRecall(apiKey, word, userReading, userMeaning, model)
    : claude.gradeWordRecall(apiKey, word, userReading, userMeaning, model);
}

/** 현재 설정에 필요한 API 키가 채워져 있는지 확인한다. */
export function hasRequiredApiKey(config: AppConfig | null): boolean {
  if (!config) return false;
  const key = config.aiProvider === 'gemini' ? config.geminiApiKey : config.claudeApiKey;
  return Boolean(key?.trim());
}
