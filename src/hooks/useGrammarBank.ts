// 드라이브 grammar/ 폴더 탐색(하위 폴더 -> .md 파일) + 선택한 파일들을 합쳐서 하나의 텍스트로
// 만들어주는 훅 — useWordBank.ts와 완전히 같은 구조다. AI가 예문/문제를 생성하거나(빈칸 채우기·
// 번역) 단어장 맞추기의 "AI 활용형 출제"를 만들 때 이 결합된 텍스트를 컨텍스트로 참고한다.
import { useCallback, useEffect, useState } from 'react';
import {
  getGrammarRootFolderId,
  listGrammarFolders,
  listGrammarFiles,
  readGrammarFileById,
} from '../lib/drive/driveClient';
import { getCached, setCached } from '../lib/storage/localCache';

const SELECTED_FILES_CACHE_KEY = 'grammarBankSelectedFiles';
const NOTES_CACHE_KEY = 'grammarBankNotes';

export interface GrammarFileRef {
  id: string;
  name: string;
}

/** 여러 파일의 내용을 하나로 합친다 — 파일마다 어디서 온 내용인지 알 수 있게 제목을 붙인다. */
function combineNotes(perFile: { name: string; text: string }[]): string {
  return perFile.map(({ name, text }) => `## ${name}\n\n${text}`).join('\n\n');
}

/** enabled가 false면 자동 로드를 건너뛴다 (Drive 인증 전에는 호출하면 에러가 나므로). */
export function useGrammarBank(enabled = true) {
  const [rootFolderId, setRootFolderId] = useState<string | null>(null);

  // 현재 보고 있는 폴더의 하위 폴더/.md 파일 목록 (탐색용)
  const [subfolders, setSubfolders] = useState<GrammarFileRef[]>([]);
  const [files, setFiles] = useState<GrammarFileRef[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  // 실제로 AI 컨텍스트로 쓰기로 선택한 파일들과, 합쳐진 텍스트
  const [selectedFiles, setSelectedFiles] = useState<GrammarFileRef[]>(
    () => getCached<GrammarFileRef[]>(SELECTED_FILES_CACHE_KEY) ?? []
  );
  const [notes, setNotes] = useState<string>(() => getCached<string>(NOTES_CACHE_KEY) ?? '');
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  /** 특정 폴더(생략 시 grammar/ 루트)의 하위 폴더 + .md 파일 목록을 불러온다. */
  const browseFolder = useCallback(async (folderId?: string) => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const [folders, fileList] = await Promise.all([listGrammarFolders(folderId), listGrammarFiles(folderId)]);
      setSubfolders(folders);
      setFiles(fileList);
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : '문법 폴더를 불러오지 못했습니다.');
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  /** 선택한 파일들을 읽어서 하나의 텍스트로 합친 뒤 반영한다. */
  const loadNotes = useCallback(async (selected: GrammarFileRef[]) => {
    setNotesLoading(true);
    setNotesError(null);
    try {
      const perFile = await Promise.all(
        selected.map(async (file) => ({ name: file.name, text: await readGrammarFileById(file.id) }))
      );
      const combined = combineNotes(perFile);
      setNotes(combined);
      setSelectedFiles(selected);
      setCached(NOTES_CACHE_KEY, combined);
      setCached(SELECTED_FILES_CACHE_KEY, selected);
    } catch (e) {
      setNotesError(e instanceof Error ? e.message : '문법 노트를 불러오지 못했습니다.');
    } finally {
      setNotesLoading(false);
    }
  }, []);

  // 최초 진입 시: grammar/ 루트를 탐색해두고, 이전에 선택해둔 파일이 있으면 그걸로 노트를 로드한다.
  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      const rootId = await getGrammarRootFolderId();
      setRootFolderId(rootId);
      await browseFolder(rootId);
      if (selectedFiles.length > 0) await loadNotes(selectedFiles);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    rootFolderId,
    subfolders,
    files,
    browseLoading,
    browseError,
    browseFolder,
    selectedFiles,
    notes,
    notesLoading,
    notesError,
    loadNotes,
  };
}

/** 게임 페이지들이 props로 받아 쓰는 useGrammarBank()의 반환 타입. */
export type GrammarBankController = ReturnType<typeof useGrammarBank>;
