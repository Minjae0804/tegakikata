// Google Drive API 연동 레이어
// - Google Identity Services(GIS)로 OAuth 액세스 토큰 발급 (index.html에서 스크립트 로드)
// - /TegakikataApp/ 폴더 및 하위 파일(config.json, wordbanks/, grammar/, saves/progress-*.json) 접근
// - drive.file 스코프 사용 (앱이 생성/선택한 파일만 접근 가능)

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ROOT_FOLDER_NAME = 'TegakikataApp';
// grammar/는 wordbanks/처럼 여러 파일을 폴더 하나에 모아두는 구조 — 문법 포인트를 주제별로
// 파일 여러 개로 나눠 관리하고, 게임에서 그중 원하는 파일만 골라 AI 컨텍스트로 쓸 수 있다.
const SUBFOLDERS = ['wordbanks', 'saves', 'grammar'] as const;

const FOLDER_ID_CACHE_KEY = 'tegakikata:driveFolderIds';

/** Drive API 에러 응답의 본문 메시지까지 포함해 던진다. */
async function throwDriveError(res: Response, label: string): Promise<never> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message ? ` — ${body.error.message}` : '';
  } catch {
    // 본문이 JSON이 아니면 무시
  }
  throw new Error(`${label}: ${res.status}${detail}`);
}


const DEFAULT_FILES: Record<string, string> = {
  'config.json': JSON.stringify({ aiProvider: 'claude', geminiApiKey: '', claudeApiKey: '' }, null, 2),
  // 예전엔 grammar.md 파일 하나뿐이었다 — 이제 grammar/ 폴더 안에 파일 여러 개를 둘 수 있고,
  // 온보딩 때는 그 폴더 안에 기본 파일 하나만 만들어둔다. 예전 grammar.md를 쓰던 사용자는
  // 드라이브에서 그 파일을 grammar/ 폴더 안으로 옮기기만 하면 그대로 이어서 쓸 수 있다.
  'grammar/N5 문법.md':
    '# 문법 노트\n\n' +
    '여기에 정리해둔 문법 포인트를 적어두면, 예문/문제를 생성하거나 단어장 맞추기의 "AI 활용형\n' +
    '출제"를 쓸 때 AI가 참고합니다. 형식은 자유롭습니다. 예:\n\n' +
    '## N5\n' +
    '- 〜てください: 부드러운 요청/지시\n' +
    '- 〜ましょう: 권유\n' +
    '- 〜すぎる: 너무 ~하다 (동사 ます형 + すぎる)\n' +
    '- 〜たい: ~하고 싶다 (동사 ます형 + たい)\n',
  // saves/ 아래 진도 파일은 더 이상 여기서 미리 만들지 않는다 — 단어장별로
  // saves/progress-<단어장 이름>.json이 따로 있고(hooks/useProgress.ts), 처음 그 단어장으로
  // 뭔가를 풀어서 저장될 때 없으면 자동으로 생긴다.
};

let accessToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms — 액세스 토큰이 이 시각 이후로 무효
let tokenClient: GoogleTokenClient | null = null;
// 진행 중인 토큰 요청(최초 로그인/조용한 재발급/새로고침 후 조용한 복원 전부 공용) — GIS는 콜백을
// tokenClient당 하나만 두는 구조라서, 지금 어떤 요청이 결과를 기다리고 있는지 여기로 추적해서
// 콜백이 왔을 때 그 요청의 프로미스를 resolve/reject한다.
let pendingRequest: { resolve: () => void; reject: (e: Error) => void } | null = null;

// 만료 이 시간 전부터는 "곧 만료됨"으로 보고 미리 갱신한다 — 요청 도중에 만료돼버리는 걸 피하기 위해.
const TOKEN_REFRESH_MARGIN_MS = 2 * 60 * 1000;

interface FolderIdCache {
  root: string;
  wordbanks: string;
  saves: string;
  grammar: string;
}

// ── 인증 ─────────────────────────────────────────────

/**
 * index.html의 GIS <script async defer>가 아직 로드 중일 수 있어,
 * window.google.accounts.oauth2가 나타날 때까지 짧게 폴링해서 기다린다.
 */
function waitForGoogleIdentityServices(timeoutMs = 8000): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const intervalMs = 100;
    let waited = 0;
    const timer = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(timer);
        resolve();
        return;
      }
      waited += intervalMs;
      if (waited >= timeoutMs) {
        clearInterval(timer);
        reject(
          new Error(
            'Google Identity Services 스크립트를 불러오지 못했습니다. 네트워크 연결이나 광고 차단기 설정을 확인해주세요.'
          )
        );
      }
    }, intervalMs);
  });
}

/**
 * Google Cloud Console에서 발급받은 OAuth 클라이언트 ID.
 * 빌드 타임 환경변수(.env의 VITE_GOOGLE_CLIENT_ID)로 주입한다 — 도메인에 묶이는 값이라
 * 사용자마다 다른 값이 아니므로 앱 화면에서 매번 입력받을 필요가 없다.
 * 포크해서 다른 도메인에 배포하는 사람만 자신의 .env에 값을 채우면 된다.
 */
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/** tokenClient가 없으면 만들어둔다 — 콜백 하나로 로그인/조용한 재발급/조용한 복원을 전부 처리한다. */
function ensureTokenClient(): GoogleTokenClient {
  if (tokenClient) return tokenClient;
  if (!GOOGLE_CLIENT_ID) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID가 설정되지 않았습니다. .env.example을 참고해 .env 파일을 만들어주세요.'
    );
  }
  tokenClient = window.google!.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: (response) => {
      const pending = pendingRequest;
      pendingRequest = null;
      if (response.error) {
        pending?.reject(new Error(`Drive 인증 실패: ${response.error}`));
        return;
      }
      accessToken = response.access_token;
      tokenExpiresAt = Date.now() + response.expires_in * 1000;
      pending?.resolve();
    },
  });
  return tokenClient;
}

/**
 * 토큰을 요청하고 결과를 기다린다. prompt를 안 주면(undefined) 기본 동작(필요하면 동의 화면 표시),
 * ''을 주면 화면 없이 조용히(이미 동의받은 적 있고 브라우저 세션이 살아있을 때만 성공) 시도한다.
 */
function requestToken(prompt?: '' | 'none' | 'consent' | 'select_account'): Promise<void> {
  return new Promise((resolve, reject) => {
    pendingRequest = { resolve, reject };
    const client = ensureTokenClient();
    if (prompt === undefined) client.requestAccessToken();
    else client.requestAccessToken({ prompt });
  });
}

/** Google Identity Services 토큰 클라이언트를 초기화하고, 사용자 동의를 받아 액세스 토큰을 발급받는다. */
export async function initDriveAuth(): Promise<void> {
  await waitForGoogleIdentityServices();
  await requestToken();
}

/**
 * 새로고침 직후 로그인 상태를 그대로 이어가기 위해 쓴다. GIS 액세스 토큰은 새로고침하면 메모리에서
 * 사라지지만(이 모듈의 accessToken은 그냥 변수라 유지되지 않는다), 예전에 한 번이라도 연결해서
 * 동의를 받은 적이 있고(로컬에 폴더 ID 캐시가 남아있음) 브라우저의 구글 로그인 세션이 아직
 * 살아있으면, 화면에 아무것도 띄우지 않고 다시 토큰을 받아올 수 있다. 실패해도(팝업 차단,
 * 구글 세션 만료, 동의 철회 등) 조용히 false만 반환한다 — 그러면 화면은 기존처럼 "다시 연결"
 * 버튼을 보여주면 된다.
 */
// 조용한 복원은 보통 1초 안팎(혹은 그보다 훨씬 빨리)이면 성공/실패가 갈린다. 드물게 iframe이
// 응답을 안 주는 등 이보다 오래 걸리는 경우, 화면을 무한정 "확인하는 중..."으로 붙잡아두지 않고
// 그냥 실패로 치고 "다시 연결" 버튼을 보여준다 — 사용자가 직접 눌러서 재시도하는 게 계속
// 기다리는 것보다 낫다.
const RESTORE_TIMEOUT_MS = 3000;

export async function tryRestoreDriveAuth(): Promise<boolean> {
  if (!GOOGLE_CLIENT_ID || !readFolderIdCache()) return false;
  try {
    await waitForGoogleIdentityServices();
    const timedOut = Symbol('timeout');
    const result = await Promise.race([
      requestToken('').then(() => true),
      new Promise<typeof timedOut>((resolve) => setTimeout(() => resolve(timedOut), RESTORE_TIMEOUT_MS)),
    ]);
    return result === true;
  } catch {
    return false;
  }
}

export function isDriveAuthenticated(): boolean {
  return accessToken !== null;
}

/** 드라이브 연결을 끊는다 — 액세스 토큰을 구글에 반납(revoke)하고 메모리에서 지운다. */
export function signOutDrive(): void {
  if (accessToken) {
    window.google?.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  tokenExpiresAt = 0;
  tokenClient = null;
}

/**
 * 액세스 토큰이 곧 만료되거나 이미 만료됐으면, 이미 한 번 동의받은 사용자이므로 로그인 팝업 없이
 * (prompt: '') 조용히 새 토큰을 받아온다. 세션을 오래 열어두면(구글 액세스 토큰은 보통 1시간 뒤
 * 만료) 아무 조치 없이는 그 이후 모든 Drive 요청이 401로 실패하며 "연결이 끊긴 것처럼" 보이던
 * 문제를, 매 요청 전에 이걸 거치게 해서 해결한다.
 */
function ensureFreshToken(): Promise<void> {
  if (accessToken && Date.now() < tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return Promise.resolve();
  }
  if (!tokenClient) {
    return Promise.reject(new Error('Drive에 인증되지 않았습니다. initDriveAuth를 먼저 호출하세요.'));
  }
  return requestToken('');
}

/**
 * 유효한 액세스 토큰을 반환한다(필요하면 먼저 조용히 재발급) — Google Picker처럼 별도
 * 라이브러리에 토큰을 직접 넘겨줘야 할 때 쓴다.
 */
export async function getFreshAccessToken(): Promise<string> {
  await ensureFreshToken();
  if (!accessToken) throw new Error('Drive에 인증되지 않았습니다. initDriveAuth를 먼저 호출하세요.');
  return accessToken;
}

async function authHeader(): Promise<HeadersInit> {
  await ensureFreshToken();
  if (!accessToken) {
    throw new Error('Drive에 인증되지 않았습니다. initDriveAuth를 먼저 호출하세요.');
  }
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * fetch를 인증 헤더와 함께 호출한다. 그래도 401이 오면(예: 갱신 직후 서버 쪽에서 아직 반영이
 * 안 됐거나, 외부에서 토큰이 무효화된 경우) 강제로 만료 처리하고 딱 한 번만 재시도한다.
 */
async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...(init.headers ?? {}), ...(await authHeader()) };
  const res = await fetch(url, { ...init, headers });
  if (res.status !== 401) return res;

  tokenExpiresAt = 0; // 강제로 "만료됨" 처리해서 ensureFreshToken이 반드시 재발급받게 한다.
  const retryHeaders = { ...(init.headers ?? {}), ...(await authHeader()) };
  return fetch(url, { ...init, headers: retryHeaders });
}

// ── 폴더/파일 기본 조작 (Drive REST v3) ──────────────────

async function findChild(name: string, parentId: string, mimeType?: string): Promise<string | null> {
  const mimeQuery = mimeType ? ` and mimeType='${mimeType}'` : '';
  const q = encodeURIComponent(`name='${name}' and '${parentId}' in parents and trashed=false${mimeQuery}`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  if (!res.ok) await throwDriveError(res, 'Drive 검색 실패');
  const data = (await res.json()) as { files: { id: string; name: string }[] };
  return data.files[0]?.id ?? null;
}

/** 특정 폴더 안의 (휴지통에 없는) 파일 목록을 가져온다. */
async function listFolderFiles(folderId: string): Promise<{ id: string; name: string }[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  if (!res.ok) await throwDriveError(res, 'Drive 폴더 목록 조회 실패');
  const data = (await res.json()) as { files: { id: string; name: string }[] };
  return data.files;
}

async function findRootFolder(name: string): Promise<string | null> {
  // drive.file 스코프에서는 'root' in parents 필터를 걸면 403이 난다.
  // root 자체는 앱이 명시적으로 생성/오픈한 적 없는 대상이라 접근 권한이 없기 때문.
  // parents 필터 없이 이름으로만 찾으면, drive.file 스코프가 알아서
  // "앱이 접근 가능한 파일" 범위로 결과를 제한해준다.
  const q = encodeURIComponent(
    `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,parents)`);
  if (!res.ok) await throwDriveError(res, 'Drive 검색 실패');
  const data = (await res.json()) as { files: { id: string; name: string; parents?: string[] }[] };
  return data.files[0]?.id ?? null;
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const res = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!res.ok) await throwDriveError(res, '폴더 생성 실패');
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function createFileWithContent(name: string, parentId: string, content: string): Promise<string> {
  const boundary = 'tegakikata-boundary';
  const metadata = { name, parents: [parentId] };
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    `${content}\r\n` +
    `--${boundary}--`;

  const res = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) await throwDriveError(res, '파일 생성 실패');
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function updateFileContent(fileId: string, content: string): Promise<void> {
  const res = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'text/plain; charset=UTF-8' },
    body: content,
  });
  if (!res.ok) await throwDriveError(res, '파일 갱신 실패');
}

async function getFileContent(fileId: string): Promise<string> {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  if (!res.ok) await throwDriveError(res, '파일 읽기 실패');
  return res.text();
}

// ── 폴더 구조 온보딩 ───────────────────────────────────

function readFolderIdCache(): FolderIdCache | null {
  const raw = localStorage.getItem(FOLDER_ID_CACHE_KEY);
  return raw ? (JSON.parse(raw) as FolderIdCache) : null;
}

function writeFolderIdCache(cache: FolderIdCache): void {
  localStorage.setItem(FOLDER_ID_CACHE_KEY, JSON.stringify(cache));
}

/**
 * /TegakikataApp/ 루트 폴더와 wordbanks/, saves/ 하위 폴더, 기본 파일들이 없으면 생성한다.
 * 폴더 ID는 localStorage에 캐싱해 재사용하고, 캐시가 없으면 이름으로 재탐색한다.
 */
export async function ensureAppFolderStructure(): Promise<FolderIdCache> {
  const cached = readFolderIdCache();
  // grammar 필드가 없으면 이 필드가 생기기 전(예전 버전)에 저장된 캐시라는 뜻이므로 무시하고
  // 다시 탐색한다 — 새 캐시가 저장되고 나면 다음부터는 이 재탐색이 다시 일어나지 않는다.
  if (cached?.grammar) return cached;

  let rootId = await findRootFolder(ROOT_FOLDER_NAME);
  if (!rootId) rootId = await createFolder(ROOT_FOLDER_NAME);

  const subfolderIds: Record<string, string> = {};
  for (const sub of SUBFOLDERS) {
    let id = await findChild(sub, rootId, 'application/vnd.google-apps.folder');
    if (!id) id = await createFolder(sub, rootId);
    subfolderIds[sub] = id;
  }

  const cache: FolderIdCache = {
    root: rootId,
    wordbanks: subfolderIds.wordbanks,
    saves: subfolderIds.saves,
    grammar: subfolderIds.grammar,
  };
  writeFolderIdCache(cache);

  // 기본 파일 생성 (이미 있으면 건너뜀)
  for (const [path, defaultContent] of Object.entries(DEFAULT_FILES)) {
    const { parentId, fileName } = resolveParent(path, cache);
    const existingId = await findChild(fileName, parentId);
    if (!existingId) await createFileWithContent(fileName, parentId, defaultContent);
  }

  return cache;
}

function resolveParent(path: string, cache: FolderIdCache): { parentId: string; fileName: string } {
  if (path.startsWith('saves/')) {
    return { parentId: cache.saves, fileName: path.slice('saves/'.length) };
  }
  if (path.startsWith('wordbanks/')) {
    return { parentId: cache.wordbanks, fileName: path.slice('wordbanks/'.length) };
  }
  if (path.startsWith('grammar/')) {
    return { parentId: cache.grammar, fileName: path.slice('grammar/'.length) };
  }
  return { parentId: cache.root, fileName: path };
}

// ── 앱 파일 읽기/쓰기 ───────────────────────────────────

/** 경로(config.json, grammar.md, saves/progress.json 등)로 앱 파일을 읽는다. JSON 확장자는 파싱해서 반환한다. */
export async function readAppFile<T>(path: string): Promise<T> {
  const cache = await ensureAppFolderStructure();
  const { parentId, fileName } = resolveParent(path, cache);
  const fileId = await findChild(fileName, parentId);
  if (!fileId) throw new Error(`파일을 찾을 수 없습니다: ${path}`);
  const text = await getFileContent(fileId);
  return (path.endsWith('.json') ? JSON.parse(text) : text) as T;
}

/** 경로로 앱 파일을 쓴다. 없으면 생성하고, 있으면 내용을 갱신한다. */
export async function writeAppFile<T>(path: string, content: T): Promise<void> {
  const cache = await ensureAppFolderStructure();
  const { parentId, fileName } = resolveParent(path, cache);
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  const existingId = await findChild(fileName, parentId);
  if (existingId) {
    await updateFileContent(existingId, text);
  } else {
    await createFileWithContent(fileName, parentId, text);
  }
}

// ── 워드뱅크(wordbanks/ 폴더) ────────────────────────────
// wordbanks/ 안에 하위 폴더를 자유롭게 만들 수 있고, 사용자는 하위 폴더 -> 그 안의 CSV 파일
// 순서로 탐색해서 실제로 게임에서 쓸 파일을 직접 고른다.

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** 주어진 폴더 바로 아래에 있는 하위 폴더 목록을 가져온다. (wordbanks/ 루트 폴더 ID를 넘기면 wordbanks/ 안의 폴더들) */
export async function listWordBankFolders(parentFolderId?: string): Promise<{ id: string; name: string }[]> {
  const cache = await ensureAppFolderStructure();
  const targetId = parentFolderId ?? cache.wordbanks;
  const q = encodeURIComponent(`'${targetId}' in parents and trashed=false and mimeType='${FOLDER_MIME}'`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  if (!res.ok) await throwDriveError(res, 'Drive 폴더 목록 조회 실패');
  const data = (await res.json()) as { files: { id: string; name: string }[] };
  return data.files;
}

/** 주어진 폴더 바로 아래에 있는 CSV 파일 목록을 가져온다. (하위 폴더는 포함하지 않음) */
export async function listWordBankCsvFiles(parentFolderId?: string): Promise<{ id: string; name: string }[]> {
  const cache = await ensureAppFolderStructure();
  const targetId = parentFolderId ?? cache.wordbanks;
  const files = await listFolderFiles(targetId);
  return files.filter((f) => f.name.endsWith('.csv'));
}

/** wordbanks/ 루트 폴더의 ID를 가져온다 (탐색을 시작할 기준점). */
export async function getWordBankRootFolderId(): Promise<string> {
  const cache = await ensureAppFolderStructure();
  return cache.wordbanks;
}

/** 파일 ID로 CSV 파일의 원본 텍스트를 직접 읽는다 (이름으로 재검색하지 않아 더 빠르다). */
export async function readWordBankFileById(fileId: string): Promise<string> {
  return getFileContent(fileId);
}

/**
 * 파일 ID로 CSV 파일 내용을 직접 덮어쓴다(이름으로 찾지 않고 ID로 바로) — 단어장 CSV에 학습
 * 진도 컬럼을 다시 써넣을 때 쓴다(hooks/useProgress.ts). writeAppFile처럼 이름으로 찾는 방식은
 * 구글 피커로 고른, wordbanks/ 폴더 밖에 있는 기존 파일에는 안 맞아서(엉뚱한 파일을 새로
 * 만들거나 다른 파일을 덮어쓸 수 있음) ID 기반으로 확실하게 그 파일만 갱신한다.
 */
export async function updateWordBankFileById(fileId: string, content: string): Promise<void> {
  await updateFileContent(fileId, content);
}

// ── 문법 노트(grammar/ 폴더) ─────────────────────────────
// wordbanks/와 동일한 구조 — grammar/ 안에 하위 폴더를 자유롭게 만들 수 있고, 사용자는
// 하위 폴더 -> 그 안의 .md 파일 순서로 탐색해서 AI 컨텍스트로 쓸 파일을 직접 고른다.

/** 주어진 폴더 바로 아래에 있는 하위 폴더 목록을 가져온다. (grammar/ 루트 폴더 ID를 넘기면 grammar/ 안의 폴더들) */
export async function listGrammarFolders(parentFolderId?: string): Promise<{ id: string; name: string }[]> {
  const cache = await ensureAppFolderStructure();
  const targetId = parentFolderId ?? cache.grammar;
  const q = encodeURIComponent(`'${targetId}' in parents and trashed=false and mimeType='${FOLDER_MIME}'`);
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
  if (!res.ok) await throwDriveError(res, 'Drive 폴더 목록 조회 실패');
  const data = (await res.json()) as { files: { id: string; name: string }[] };
  return data.files;
}

/** 주어진 폴더 바로 아래에 있는 .md 파일 목록을 가져온다. (하위 폴더는 포함하지 않음) */
export async function listGrammarFiles(parentFolderId?: string): Promise<{ id: string; name: string }[]> {
  const cache = await ensureAppFolderStructure();
  const targetId = parentFolderId ?? cache.grammar;
  const files = await listFolderFiles(targetId);
  return files.filter((f) => f.name.endsWith('.md') || f.name.endsWith('.txt'));
}

/** grammar/ 루트 폴더의 ID를 가져온다 (탐색을 시작할 기준점). */
export async function getGrammarRootFolderId(): Promise<string> {
  const cache = await ensureAppFolderStructure();
  return cache.grammar;
}

/** 파일 ID로 문법 노트 파일의 원본 텍스트를 직접 읽는다 (이름으로 재검색하지 않아 더 빠르다). */
export async function readGrammarFileById(fileId: string): Promise<string> {
  return getFileContent(fileId);
}