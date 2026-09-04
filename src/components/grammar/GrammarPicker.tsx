// 드라이브 grammar/ 폴더를 하위 폴더 -> .md 파일 순으로 탐색하고,
// 실제로 AI 컨텍스트로 쓸 파일들을 체크박스로 골라 "적용"하는 피커.
// components/wordbank/WordBankPicker.tsx와 완전히 같은 구조 — 문법 노트는 CSV처럼 형식을
// 검증할 필요가 없는 자유 형식 텍스트라 업로드 시 별도 검증 단계가 없다는 점만 다르다.
import { useRef, useState } from 'react';
import { Button } from '../common/Button';
import type { GrammarFileRef } from '../../hooks/useGrammarBank';
import { openMarkdownFilePicker } from '../../lib/drive/picker';
import { writeAppFile } from '../../lib/drive/driveClient';

interface GrammarPickerProps {
  rootFolderId: string | null;
  subfolders: GrammarFileRef[];
  files: GrammarFileRef[];
  browseLoading: boolean;
  browseError: string | null;
  onBrowse: (folderId?: string) => void;
  selectedFiles: GrammarFileRef[];
  notesLoading: boolean;
  onApply: (files: GrammarFileRef[]) => void;
}

const NEW_NOTE_TEMPLATE = '# 문법 노트\n\n- 〜すぎる: 너무 ~하다 (동사 ます형 + すぎる)\n';

export function GrammarPicker({
  rootFolderId,
  subfolders,
  files,
  browseLoading,
  browseError,
  onBrowse,
  selectedFiles,
  notesLoading,
  onApply,
}: GrammarPickerProps) {
  // 지금 보고 있는 폴더 (없으면 루트)
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set(selectedFiles.map((f) => f.id)));
  // 피커로 새로 골라서 이번 세션에 추가된 파일들 (현재 폴더 목록엔 안 뜨지만 체크 대상에 포함)
  const [pickedFiles, setPickedFiles] = useState<GrammarFileRef[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);

  // 새 문법 노트 만들기 폼
  const [createOpen, setCreateOpen] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newNoteText, setNewNoteText] = useState(NEW_NOTE_TEMPLATE);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // 로컬 .md/.txt 파일 업로드
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleEnterFolder = (folderId: string) => {
    setCurrentFolderId(folderId);
    onBrowse(folderId);
  };

  const handleBackToRoot = () => {
    setCurrentFolderId(undefined);
    onBrowse(rootFolderId ?? undefined);
  };

  const toggleChecked = (file: GrammarFileRef) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
  };

  const handleApply = () => {
    const allKnownFiles = [...files, ...pickedFiles, ...selectedFiles];
    const merged = new Map<string, GrammarFileRef>();
    for (const f of allKnownFiles) if (checkedIds.has(f.id)) merged.set(f.id, f);
    onApply(Array.from(merged.values()));
  };

  const handlePickFromDrive = async () => {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const picked = await openMarkdownFilePicker();
      if (picked.length === 0) return; // 취소한 경우
      setPickedFiles((prev) => {
        const merged = new Map(prev.map((f) => [f.id, f]));
        for (const f of picked) merged.set(f.id, f);
        return Array.from(merged.values());
      });
      setCheckedIds((prev) => {
        const next = new Set(prev);
        for (const f of picked) next.add(f.id);
        return next;
      });
    } catch (e) {
      setPickerError(e instanceof Error ? e.message : '파일 선택에 실패했습니다.');
    } finally {
      setPickerLoading(false);
    }
  };

  const handleUploadFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const text = await file.text();
      const fileName = /\.(md|txt)$/i.test(file.name) ? file.name : `${file.name}.md`;
      await writeAppFile(`grammar/${fileName}`, text);
      onBrowse(currentFolderId ?? rootFolderId ?? undefined); // 새로 올린 파일이 목록에 보이도록 새로고침
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '파일을 업로드하지 못했습니다.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateNote = async () => {
    const trimmedName = newFileName.trim();
    if (!trimmedName) return;
    const fileName = /\.(md|txt)$/i.test(trimmedName) ? trimmedName : `${trimmedName}.md`;
    setCreating(true);
    setCreateError(null);
    try {
      await writeAppFile(`grammar/${fileName}`, newNoteText);
      setNewFileName('');
      setNewNoteText(NEW_NOTE_TEMPLATE);
      setCreateOpen(false);
      onBrowse(currentFolderId ?? rootFolderId ?? undefined); // 새로 만든 파일이 목록에 보이도록 새로고침
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '문법 노트 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  // 체크박스로 보여줄 파일 목록 — 지금 폴더에 실제로 있는 파일뿐 아니라, 이미 적용돼 있거나(다른
  // 폴더/드라이브 피커로 골라둔 파일 포함) 이번 세션에 방금 피커로 고른 파일도 함께 보여준다.
  // 안 그러면 "이미 적용됨" 상태인데 지금 보는 폴더엔 그 파일이 없어서 목록이 텅 비어 보이고,
  // 체크 해제할 방법도 없어 보이는 문제가 생긴다.
  const displayedFilesMap = new Map<string, GrammarFileRef>();
  for (const f of files) displayedFilesMap.set(f.id, f);
  for (const f of pickedFiles) displayedFilesMap.set(f.id, f);
  for (const f of selectedFiles) displayedFilesMap.set(f.id, f);
  const displayedFiles = Array.from(displayedFilesMap.values());
  const inCurrentFolder = new Set(files.map((f) => f.id));

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-box)] border border-base-300 bg-base-100 p-4">
      <div className="flex items-center justify-between">
        <span className="font-body text-xs text-base-content/60">
          {currentFolderId ? '하위 폴더' : 'grammar/ 루트'}
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

      {!browseLoading && displayedFiles.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-body text-xs text-base-content/40">문법 노트 파일</span>
          {displayedFiles.map((file) => (
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
              {!inCurrentFolder.has(file.id) && (
                <span className="font-body text-base-content/30">— 이미 적용됨 (다른 폴더)</span>
              )}
            </label>
          ))}
        </div>
      )}

      {!browseLoading && subfolders.length === 0 && displayedFiles.length === 0 && (
        <p className="font-body text-xs text-base-content/40">이 폴더엔 파일이 없어요.</p>
      )}

      <Button variant="primary" size="sm" onClick={handleApply} disabled={notesLoading}>
        {notesLoading ? '적용하는 중...' : `선택한 문법 노트 적용 (${checkedIds.size}개)`}
      </Button>

      <div className="flex flex-col gap-2 border-t border-base-300 pt-3">
        <Button variant="outline" size="sm" onClick={() => void handlePickFromDrive()} disabled={pickerLoading}>
          {pickerLoading ? '여는 중...' : '내 드라이브에서 파일 선택'}
        </Button>
        {pickerError && <p className="font-body text-xs text-secondary">{pickerError}</p>}
        <p className="font-body text-xs text-base-content/40">
          직접 만들어둔 .md/.txt 파일은 이 방법으로 골라야 앱이 접근할 수 있어요.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-base-300 pt-3">
        <span className="font-body text-xs text-base-content/60">파일 업로드</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt,text/markdown,text/plain"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUploadFile(file);
          }}
          disabled={uploading}
          className="file-input file-input-bordered file-input-sm w-full rounded-[var(--radius-field)] text-xs"
        />
        {uploading && <p className="font-body text-xs text-base-content/50">저장하는 중...</p>}
        {uploadError && <p className="font-body text-xs text-secondary">{uploadError}</p>}
      </div>

      <div className="flex flex-col gap-2 border-t border-base-300 pt-3">
        <Button variant="ghost" size="sm" onClick={() => setCreateOpen((v) => !v)}>
          {createOpen ? '새 문법 노트 만들기 닫기' : '+ 새 문법 노트 만들기'}
        </Button>

        {createOpen && (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-base-content/60">파일 이름</span>
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="동사 활용"
                className="input input-bordered input-sm w-full rounded-[var(--radius-field)] font-data text-xs"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-body text-xs text-base-content/60">내용 (자유 형식 마크다운)</span>
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                rows={5}
                className="textarea textarea-bordered w-full rounded-[var(--radius-field)] font-data text-xs"
              />
            </label>
            {createError && <p className="font-body text-xs text-secondary">{createError}</p>}
            <Button
              variant="primary"
              size="sm"
              onClick={() => void handleCreateNote()}
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
