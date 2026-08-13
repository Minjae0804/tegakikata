// 탁음(゛)/반탁음(゜) 변환 — 실제 휴대폰 자판처럼 "기본 글자 입력 후 변환 키"로 처리하기 위한 매핑.

const DAKUTEN_MAP: Record<string, string> = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
  さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど',
  は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
};

const HANDAKUTEN_MAP: Record<string, string> = {
  は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ',
};

/**
 * 글자에 탁음/반탁음을 적용한다. 대상이 아닌 글자(예: 한자, 이미 탁음인 글자, や행 등)면
 * 원래 글자를 그대로 반환한다.
 */
export function applyDakuten(char: string, type: 'dakuten' | 'handakuten'): string {
  const map = type === 'dakuten' ? DAKUTEN_MAP : HANDAKUTEN_MAP;
  return map[char] ?? char;
}
