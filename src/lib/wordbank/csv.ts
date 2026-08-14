// 워드뱅크 CSV 파싱/직렬화
// 사용자가 Google Drive에서 스프레드시트로 직접 열어 수정할 수 있도록 CSV로 저장한다.
//
// 컬럼 (헤더 이름 기준으로 파싱 — 순서는 상관없음):
//   kanji       (선택) 한자/표제어 — たくさん처럼 한자가 없는 단어는 비워둬도 됨
//   reading     (필수) 읽기 (히라가나/가타카나)
//   meaning     (필수) 한국어 뜻
//   jlpt_level  (선택) N5~N1
//   notes       (선택) 사용자 메모
//
// kanji가 비어있으면(한자 없는 단어) 각 게임이 알아서 "한자 쓰기" 대신 "읽기 쓰기"로,
// "한자 보고 뜻/읽기 맞히기" 대신 "읽기 보고 뜻 맞히기"로 문제 형태를 바꿔서 낸다.
//
// id는 컬럼에 없고 kanji+reading 조합으로 파싱 시점에 자동 생성한다.

import type { WordEntry } from '../../types';

// kanji 컬럼 자체는 헤더에 있어야 하지만(포맷 일관성을 위해), 행마다 값은 비워둘 수 있다.
const REQUIRED_COLUMNS = ['kanji', 'reading', 'meaning'] as const;
const VALID_JLPT_LEVELS = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);

/** 한 줄을 콤마 기준으로 나누되, 큰따옴표로 감싼 필드 안의 콤마/줄바꿈/이스케이프된 따옴표("")를 지원한다. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  // 마지막 줄 처리 (개행으로 안 끝난 경우)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function makeWordId(kanji: string, reading: string): string {
  return `${kanji}_${reading}`;
}

/** CSV 문자열을 WordEntry 배열로 파싱한다. 필수 컬럼이 없으면 에러를 던진다. */
export function parseWordBankCsv(csvText: string): WordEntry[] {
  const withoutBom = csvText.replace(/^\uFEFF/, ''); // 엑셀/구글시트 내보내기 시 흔히 붙는 BOM 제거
  const rows = parseCsvRows(withoutBom.trim());
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  for (const required of REQUIRED_COLUMNS) {
    if (!header.includes(required)) {
      throw new Error(`워드뱅크 CSV에 필수 컬럼 "${required}"이 없습니다.`);
    }
  }

  const colIndex = (name: string) => header.indexOf(name);
  const kanjiIdx = colIndex('kanji');
  const readingIdx = colIndex('reading');
  const meaningIdx = colIndex('meaning');
  const jlptIdx = colIndex('jlpt_level');
  const notesIdx = colIndex('notes');

  const entries: WordEntry[] = [];
  for (const row of rows.slice(1)) {
    // kanji는 비어있을 수 있다(한자 없는 단어) — reading/meaning만 필수.
    const kanji = row[kanjiIdx]?.trim() ?? '';
    const reading = row[readingIdx]?.trim();
    const meaning = row[meaningIdx]?.trim();
    if (!reading || !meaning) continue; // 필수값 비어있는 행은 건너뜀

    const rawLevel = jlptIdx >= 0 ? row[jlptIdx]?.trim().toUpperCase() : undefined;
    const jlptLevel = rawLevel && VALID_JLPT_LEVELS.has(rawLevel) ? (rawLevel as WordEntry['jlptLevel']) : undefined;
    const notes = notesIdx >= 0 ? row[notesIdx]?.trim() || undefined : undefined;

    entries.push({ id: makeWordId(kanji, reading), kanji, reading, meaning, jlptLevel, notes });
  }

  return entries;
}

/** WordEntry 배열을 CSV 문자열로 직렬화한다 (드라이브에 다시 저장할 때 사용). */
export function serializeWordBankCsv(words: WordEntry[]): string {
  const header = ['kanji', 'reading', 'meaning', 'jlpt_level', 'notes'];
  const lines = [header.join(',')];

  for (const w of words) {
    lines.push(
      [w.kanji, w.reading, w.meaning, w.jlptLevel ?? '', w.notes ?? '']
        .map(escapeCsvField)
        .join(',')
    );
  }

  return lines.join('\n');
}
