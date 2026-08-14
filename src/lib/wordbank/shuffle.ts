// 단어장 순서를 무작위로 섞는 유틸 — CSV에 적힌 순서 그대로 반복 출제되는 걸 막기 위해 쓴다.

/** Fisher-Yates 셔플. 원본 배열은 건드리지 않고 새 배열을 반환한다. */
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
