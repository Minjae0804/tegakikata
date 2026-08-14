// 드라이브 wordbanks/ 폴더를 하위 폴더 -> CSV 파일 순으로 탐색하고,
// 실제로 게임에서 쓸 CSV 파일들을 체크박스로 골라 "적용"하는 피커.
//
// 세 가지 방법으로 CSV를 확보할 수 있다:
// 1) "내 드라이브에서 파일 선택" — Google Picker로, 앱이 만들지 않은 기존 CSV도
//    사용자가 직접 골라서 접근 권한을 부여할 수 있다 (drive.file 스코프의 정식 우회로).
// 2) "CSV 파일 업로드" — 로컬 파일(예: AI로 만든 단어장, docs/WORDBANK_AI_PROMPT.md 참고)을
//    올리면 형식(필수 컬럼/유효 행)을 먼저 검증하고, 통과하면 wordbanks/ 에 자동 저장한다.
// 3) "새 단어장 만들기" — 앱 안에서 파일 이름과 CSV 내용을 직접 입력해 생성한다.
// 2), 3)은 앱이 직접 만든 파일이라 나중에 검색으로도 항상 접근 가능하다.
import { useRef, useState } from 'react';
import { Button } from '../common/Button';
import type { WordBankFileRef } from '../../hooks/useWordBank';
import { openCsvFilePicker } from '../../lib/drive/picker';
import { writeAppFile } from '../../lib/drive/driveClient';
import { parseWordBankCsv } from '../../lib/wordbank/csv';

interface WordBankPickerProps {
  rootFolderId: string | null;
  subfolders: WordBankFileRef[];
  csvFiles: WordBankFileRef[];
  browseLoading: boolean;
  browseError: string | null;
  onBrowse: (folderId?: string) => void;
  selectedFiles: WordBankFileRef[];
  wordsLoading: boolean;
  onApply: (files: WordBankFileRef[]) => void;
}

const NEW_WORDBANK_TEMPLATE = 'kanji,reading,meaning,jlpt_level,notes\n食,たべる,먹다,N5,\n';

export function WordBankPicker({
  rootFolderId,
  subfolders,
  csvFiles,
  browseLoading,
  browseError,
  onBrowse,
  selectedFiles,
  wordsLoading,
  onApply,
}: WordBankPickerProps) {
  // 지금 보고 있는 폴더 (없으면 루트)
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(selectedFiles.map((f) => f.id))
  );
  // 피커로 새로 골라서 이번 세션에 추가된 파일들 (현재 폴더 목록엔 안 뜨지만 체크 대상에 포함)
  const [pickedFiles, setPickedFiles] = useState<WordBankFileRef[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // 새 단어장 만들기 폼
  const [createOpen, setCreateOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newCsvText, setNewCsvText] = useState(NEW_WORDBANK_TEMPLATE);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // CSV 파일 업로드 (로컬 파일 -> 형식 검증 -> wordbanks/ 자동 저장)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const handleEnterFolder = (folderId: string) => {
    setCurrentFolderId(folderId);
    onBrowse(folderId);
  };

  const handleBackToRoot = () => {
    setCurrentFolderId(undefined);
    onBrowse(rootFolderId ?? undefined);
  };

  const toggleChecked = (file: WordBankFileRef) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
  };

  const handleApply = () => {
    const allKnownFiles = [...csvFiles, ...pickedFiles, ...selectedFiles];
    const merged = new Map<string, WordBankFileRef>();
    for (const f of allKnownFiles) if (checkedIds.has(f.id)) merged.set(f.id, f);
    onApply(Array.from(merged.values()));
  };

  const handlePickFromDrive = async () => {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const files = await openCsvFilePicker();
      if (files.length === 0) return; // 취소한 경우
      setPickedFiles((prev) => {
        const merged = new Map(prev.map((f) => [f.id, f]));
        for (const f of files) merged.set(f.id, f);
        return Array.from(merged.values());
      });
      setCheckedIds((prev) => {
        const next = new Set(prev);
        for (const f of files) next.add(f.id);
        return next;
      });
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : '파일 선택에 실패했습니다.');
    } finally {
      setPickerLoading(false);
    }
  };

  /** 로컬 CSV 파일을 읽어 형식(필수 컬럼/유효 행)을 먼저 검증하고, 통과하면 wordbanks/ 에 저장한다. */
  const handleUploadFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const text = await file.text();
      const entries = parseWordBankCsv(text); // 필수 컬럼이 없으면 여기서 에러를 던짐
      if (entries.length === 0) {
        throw new Error('유효한 단어가 하나도 없어요. kanji/reading/meaning 값이 채워진 행이 있는지 확인해주세요.');
      }
      const fileName = file.name.endsWith('.csv') ? file.name : `${file.name}.csv`;
      await writeAppFile(`wordbanks/${fileName}`, text);
      setUploadSuccess(`"${fileName}" — 단어 ${entries.length}개 확인 후 저장했어요.`);
      onBrowse(currentFolderId ?? rootFolderId ?? undefined); // 새로 올린 파일이 목록에 보이도록 새로고침
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '파일을 업로드하지 못했습니다.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateWordBank = async () => {
    const trimmedName = newFileName.trim();
    if (!trimmedName) return;
    const fileName = trimmedName.endsWith('.csv') ? trimmedName : `${trimmedName}.csv`;
    setCreating(true);
    setCreateError(null);
    try {
      await writeAppFile(`wordbanks/${fileName}`, newCsvText);
      setNewFileName('');
      setNewCsvText(NEW_WORDBANK_TEMPLATE);
      setCreateOpen(false);
      onBrowse(currentFolderId ?? rootFolderId ?? undefined); // 새로 만든 파일이 목록에 보이도록 새로고침
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '단어장 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-4">
      <div className="flex items-center justify-between">
        <span className="font-body text-xs text-base-content/60">
          {currentFolderId ? '하위 폴더' : 'wordbanks/ 루트'}
        </span>
        {currentFolderId && (
          <Button variant="ghost" size="sm" onClick={handleBackToRoot}>
            ← 루트로
          </Button>
        )}
      </div>

      {browseLoading && <p className="font-body text-xs text-base-content/50">불러오는 중...</p>}
      {browseError && <p className="font-body text-xs text-secondary">{browseError}</p>}

      {!browseLoading && subfolders.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-body text-xs text-base-content/40">폴더</span>
          {subfolders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => handleEnterFolder(folder.id)}
              className="font-body flex items-center gap-2 rounded-[var(--radius-field)] px-2 py-1.5 text-left text-sm
                         hover:bg-base-200"
            >
              📁 {folder.name}
            </button>
          ))}
        </div>
      )}

      {!browseLoading && (csvFiles.length > 0 || pickedFiles.length > 0) && (
        <div className="flex flex-col gap-1">
          <span className="font-body text-xs text-base-content/40">CSV 파일</span>
          {[...csvFiles, ...pickedFiles.filter((p) => !csvFiles.some((f) => f.id === p.id))].map((file) => (
            <label
              key={file.id}
              className="font-body flex items-center gap-2 rounded-[var(--radius-field)] px-2 py-1.5 text-sm hover:bg-base-200"
            >
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={checkedIds.has(file.id)}
                onChange={() => toggleChecked(file)}
              />
              {file.name}
            </label>
          ))}
        </div>
      )}

      {!browseLoading && subfolders.length === 0 && csvFiles.length === 0 && pickedFiles.length === 0 && (
        <p className="font-body text-xs text-base-content/40">이 폴더엔 파일이 없어요.</p>
      )}

      <Button variant="primary" size="sm" onClick={handleApply} disabled={wordsLoading}>
        {wordsLoading ? '적용하는 중...' : `선택한 단어장 적용 (${checkedIds.size}개)`}
      </Button>

      <div className="flex flex-col gap-2 border-t border-base-300 pt-3">
        <Button variant="outline" size="sm" onClick={() => void handlePickFromDrive()} disabled={pickerLoading}>
          {pickerLoading ? '여는 중...' : '내 드라이브에서 파일 선택'}
        </Button>
        {pickerError && <p className="font-body text-xs text-secondary">{pickerError}</p>}
        <p className="font-body text-xs text-base-content/40">
          직접 만들어둔 CSV 파일은 이 방법으로 골라야 앱이 접근할 수 있어요.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-base-300 pt-3">
        <span className="font-body text-xs text-base-content/60">CSV 파일 업로드</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUploadFile(file);
          }}
          disabled={uploading}
          className="file-input file-input-bordered file-input-sm w-full rounded-[var(--radius-field)] text-xs"
        />
        {uploading && <p className="font-body text-xs text-base-content/50">형식 확인하고 저장하는 중...</p>}
        {uploadError && <p className="font-body text-xs text-secondary">{uploadError}</p>}
        {uploadSuccess && <p className="font-body text-xs text-primary">{uploadSuccess}</p>}
        <p className="font-body text-xs text-base-content/40">
          형식(필수 컬럼 kanji/reading/meaning, 유효한 행 존재 여부)을 확인한 뒤 통과하면
          wordbanks/ 에 자동으로 저장돼요. AI로 단어장을 만들었다면 이 방법이 가장 빠릅니다 —{' '}
          <a
            href="https://github.com/Minjae0804/tegakikata/blob/main/docs/WORDBANK_AI_PROMPT.md"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            AI로 단어장 만들기
          </a>
          .
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-base-300 pt-3">
        <Button variant="ghost" size="sm" onClick={() => setCreateOpen((v) => !v)}>
          {createOpen ? '새 단어장 만들기 닫기' : '+ 새 단어장 만들기'}
        </Button>

        {createOpen && (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-base-content/60">파일 이름</span>
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="my-wordbank"
                className="input input-bordered input-sm w-full rounded-[var(--radius-field)] font-data text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-base-content/60">
                CSV 내용 (kanji,reading,meaning,jlpt_level,notes)
              </span>
              <textarea
                value={newCsvText}
                onChange={(e) => setNewCsvText(e.target.value)}
                rows={5}
                className="textarea textarea-bordered w-full rounded-[var(--radius-field)] font-data text-xs"
              />
            </label>
            {createError && <p className="font-body text-xs text-secondary">{createError}</p>}
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleCreateWordBank()}
              disabled={!newFileName.trim() || creating}
            >
              {creating ? '만드는 중...' : '만들기'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
