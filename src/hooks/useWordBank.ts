// 드라이브 wordbanks/ 폴더 탐색(하위 폴더 -> CSV 파일) + 선택한 파일들을 WordEntry[]로 합쳐주는 훅
import { useCallback, useEffect, useState } from 'react';
import type { WordEntry } from '../types';
import {
  getWordBankRootFolderId,
  listWordBankFolders,
  listWordBankCsvFiles,
  readWordBankFileById,
} from '../lib/drive/driveClient';
import { parseWordBankCsv, sanitizeBankName } from '../lib/wordbank/csv';
import { getCached, setCached } from '../lib/storage/localCache';

const SELECTED_FILES_CACHE_KEY = 'wordBankSelectedFiles';
const WORDS_CACHE_KEY = 'wordBank';

export interface WordBankFileRef {
  id: string;
  name: string;
}

/** enabled가 false면 자동 로드를 건너뛴다 (Drive 인증 전에는 호출하면 에러가 나므로). */
export function useWordBank(enabled = true) {
  const [rootFolderId, setRootFolderId] = useState<string | null>(null);

  // 현재 보고 있는 폴더의 하위 폴더/CSV 파일 목록 (탐색용)
  const [subfolders, setSubfolders] = useState<WordBankFileRef[]>([]);
  const [csvFiles, setCsvFiles] = useState<WordBankFileRef[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);

  // 실제로 게임에서 쓰기로 선택한 파일들과, 거기서 파싱된 단어
  const [selectedFiles, setSelectedFiles] = useState<WordBankFileRef[]>(
    () => getCached<WordBankFileRef[]>(SELECTED_FILES_CACHE_KEY) ?? []
  );
  const [words, setWords] = useState<WordEntry[]>(() => getCached<WordEntry[]>(WORDS_CACHE_KEY) ?? []);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [wordsError, setWordsError] = useState<string | null>(null);

  /** 특정 폴더(생략 시 wordbanks/ 루트)의 하위 폴더 + CSV 파일 목록을 불러온다. */
  const browseFolder = useCallback(async (folderId?: string) => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const [folders, files] = await Promise.all([
        listWordBankFolders(folderId),
        listWordBankCsvFiles(folderId),
      ]);
      setSubfolders(folders);
      setCsvFiles(files);
    } catch (e) {
      setBrowseError(e instanceof Error ? e.message : '단어장 폴더를 불러오지 못했습니다.');
    } finally {
      setBrowseLoading(false);
    }
  }, []);

  /** 선택한 CSV 파일들을 읽어서 파싱하고, 병합된 단어 목록으로 반영한다. */
  const loadWords = useCallback(async (files: WordBankFileRef[]) => {
    setWordsLoading(true);
    setWordsError(null);
    try {
      const parsedPerFile = await Promise.all(
        files.map(async (file) => {
          const csvText = await readWordBankFileById(file.id);
          return parseWordBankCsv(csvText, sanitizeBankName(file.name));
        })
      );
      const merged = new Map<string, WordEntry>();
      for (const entries of parsedPerFile) {
        for (const entry of entries) merged.set(entry.id, entry);
      }
      const result = Array.from(merged.values());
      setWords(result);
      setSelectedFiles(files);
      setCached(WORDS_CACHE_KEY, result);
      setCached(SELECTED_FILES_CACHE_KEY, files);
    } catch (e) {
      setWordsError(e instanceof Error ? e.message : '단어장을 불러오지 못했습니다.');
    } finally {
      setWordsLoading(false);
    }
  }, []);

  // 최초 진입 시: wordbanks/ 루트를 탐색해두고, 이전에 선택해둔 파일이 있으면 그걸로 단어를 로드한다.
  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      const rootId = await getWordBankRootFolderId();
      setRootFolderId(rootId);
      await browseFolder(rootId);
      if (selectedFiles.length > 0) await loadWords(selectedFiles);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    rootFolderId,
    subfolders,
    csvFiles,
    browseLoading,
    browseError,
    browseFolder,
    selectedFiles,
    words,
    wordsLoading,
    wordsError,
    loadWords,
  };
}

/** 게임 페이지들이 props로 받아 쓰는 useWordBank()의 반환 타입 — App 레벨에서 하나만 만들어
 *  공유한다(useProgress처럼). 페이지마다 따로 만들면 한 화면에서 단어장을 바꿔도 다른 화면이
 *  자기 캐시를 그대로 들고 있어서 어긋날 수 있어서다. */
export type WordBankController = ReturnType<typeof useWordBank>;
