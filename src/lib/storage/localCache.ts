// localStorage 캐시 레이어
// 앱 로딩 시 드라이브에서 읽어온 내용을 캐싱, 세션 중에는 여기서 읽고 씀

const PREFIX = 'tegakikata:';

export function getCached<T>(key: string): T | null {
  const raw = localStorage.getItem(PREFIX + key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export function setCached<T>(key: string, value: T): void {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export function clearCache(): void {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}
