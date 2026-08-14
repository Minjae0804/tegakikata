// たくさん처럼 한자 표기가 없는(읽기만 있는) 단어인지 판별한다.
// CSV의 kanji 컬럼이 비어있으면 이 단어는 "한자 쓰기"가 아니라 "읽기 쓰기"로 문제를 내야 하고,
// "한자 보고 맞히기" 방향에서도 한자 대신 읽기를 보여줘야 한다 — 여러 게임 페이지에서 공용으로 쓴다.
import type { WordEntry } from '../../types';

export function hasKanji(word: WordEntry): boolean {
  return word.kanji.trim() !== '';
}
