// 워드뱅크 CSV 파싱/직렬화
// 사용자가 Google Drive에서 스프레드시트로 직접 열어 수정할 수 있도록 CSV로 저장한다.
//
// 컬럼 (헤더 이름 기준으로 파싱 — 순서는 상관없음):
//   kanji       (선택) 한자/표제어 — たくさん처럼 한자가 없는 단어는 비워둬도 됨
//   reading     (필수) 읽기 (히라가나/가타카나)
//   meaning     (필수) 한국어 뜻
//   jlpt_level  (선택) N5~N1
//   notes       (선택) 사용자 메모
//   kanji_e / kanji_iv / kanji_r / kanji_la / kanji_l / kanji_n       (선택) "한자 쓰기" 학습 진도
//   reading_e / reading_iv / reading_r / reading_la / reading_l / reading_n (선택) "읽기·뜻 회상" 학습 진도
//
// kanji가 비어있으면(한자 없는 단어) 각 게임이 알아서 "한자 쓰기" 대신 "읽기 쓰기"로,
// "한자 보고 뜻/읽기 맞히기" 대신 "읽기 보고 뜻 맞히기"로 문제 형태를 바꿔서 낸다.
//
// 진도 컬럼: 학습 진도(SRS)를 별도 저장 파일이 아니라 단어장 CSV 자체에 컬럼으로 같이 둔다 —
// 그래서 단어장 하나(CSV 파일 하나)가 어휘 목록이자 세이브 파일이다. e/iv/r/la/l/n은 각각
// ease/intervalMinutes/reps/lapses/lastReviewedAt/nextReviewAt(hooks/useProgress.ts의
// StoredProgressEntry와 동일한 축약)이고, 한 번도 안 푼 스킬은 전부 빈 칸으로 둔다. 이 컬럼들은
// 앱이 자동으로 채우고 갱신하므로 굳이 직접 손댈 필요는 없다(손대도 무방하지만 형식을 지켜야 함).
//
// id는 컬럼에 없고 "이 CSV가 속한 단어장 이름 + kanji+reading" 조합으로 파싱 시점에 자동
// 생성한다 — 단어장별로 진도를 따로 저장하기 때문에, 서로 다른 단어장에 같은 단어(같은
// kanji+reading)가 있어도 진도는 섞이지 않는다.

import type { ProgressEntry, WordEntry } from '../../types';
import { skillKey, type Skill } from '../srs/schedule';

// kanji 컬럼 자체는 헤더에 있어야 하지만(포맷 일관성을 위해), 행마다 값은 비워둘 수 있다.
const REQUIRED_COLUMNS = ['kanji', 'reading', 'meaning'] as const;
const VALID_JLPT_LEVELS = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);

// 진도 컬럼 이름 — 스킬별로 6개씩(ease/interval/reps/lapses/lastReviewedAt/nextReviewAt).
const PROGRESS_SKILLS: Skill[] = ['kanji', 'reading'];
function progressColumnNames(skill: Skill): { e: string; iv: string; r: string; la: string; l: string; n: string } {
  return {
    e: `${skill}_e`,
    iv: `${skill}_iv`,
    r: `${skill}_r`,
    la: `${skill}_la`,
    l: `${skill}_l`,
    n: `${skill}_n`,
  };
}

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

/**
 * 드라이브 CSV 파일 이름을 진도 관련 키/경로 등에 쓸 수 있는 "단어장 이름"으로 다듬는다.
 * ".csv" 확장자를 떼고, id 파싱에 쓰는 구분자("::")나 경로 구분자("/")는 섞이면 안 되니 치환한다.
 */
export function sanitizeBankName(fileName: string): string {
  const base = fileName.replace(/\.csv$/i, '').trim();
  const cleaned = base.replace(/::/g, '_').replace(/\//g, '_');
  return cleaned || '단어장';
}

function makeWordId(bankName: string, kanji: string, reading: string): string {
  return `${bankName}::${kanji}_${reading}`;
}

function readProgressEntry(row: string[], colIndex: (name: string) => number, skill: Skill): ProgressEntry | undefined {
  const cols = progressColumnNames(skill);
  const eIdx = colIndex(cols.e);
  if (eIdx < 0) return undefined; // 이 컬럼 자체가 없는(예전 형식) CSV
  const eRaw = row[eIdx]?.trim();
  if (!eRaw) return undefined; // 이 스킬로는 아직 한 번도 안 풀어본 단어
  const ivIdx = colIndex(cols.iv);
  const rIdx = colIndex(cols.r);
  const laIdx = colIndex(cols.la);
  const lIdx = colIndex(cols.l);
  const nIdx = colIndex(cols.n);
  return {
    wordId: '', // 호출부에서 실제 wordId로 채워 넣는다(스킬 키까지 합쳐서)
    ease: Number(eRaw),
    intervalMinutes: Number(row[ivIdx]?.trim() || '0'),
    reps: Number(row[rIdx]?.trim() || '0'),
    lapses: Number(row[laIdx]?.trim() || '0'),
    lastReviewedAt: row[lIdx]?.trim() || undefined,
    nextReviewAt: row[nIdx]?.trim() || undefined,
  };
}

/** CSV 문자열을 WordEntry 배열로 파싱한다. 필수 컬럼이 없으면 에러를 던진다.
 *  bankName은 이 CSV가 속한 단어장 이름, fileId는 그 CSV 파일의 드라이브 파일 ID —
 *  둘 다 진도를 어디에(어떤 단어장, 어떤 파일) 다시 저장할지 판단하는 데 쓰인다. */
export function parseWordBankCsv(csvText: string, bankName: string, fileId: string): WordEntry[] {
  const withoutBom = (csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText); // 엑셀/구글시트 내보내기 시 흔히 붙는 BOM 제거
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

    entries.push({ id: makeWordId(bankName, kanji, reading), bankName, fileId, kanji, reading, meaning, jlptLevel, notes });
  }

  return entries;
}

/**
 * 같은 CSV에서 진도 컬럼만 뽑아 skillKey로 색인된 Map으로 반환한다(hooks/useProgress.ts 전용).
 * 어휘(kanji/reading/meaning 등)는 parseWordBankCsv가 이미 처리하므로 여기서는 진도만 본다.
 */
export function parseWordBankCsvProgress(csvText: string, bankName: string): Map<string, ProgressEntry> {
  const withoutBom = (csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText);
  const rows = parseCsvRows(withoutBom.trim());
  const result = new Map<string, ProgressEntry>();
  if (rows.length === 0) return result;

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = (name: string) => header.indexOf(name);
  const kanjiIdx = colIndex('kanji');
  const readingIdx = colIndex('reading');

  for (const row of rows.slice(1)) {
    const kanji = row[kanjiIdx]?.trim() ?? '';
    const reading = row[readingIdx]?.trim();
    if (!reading) continue;
    const wordId = makeWordId(bankName, kanji, reading);

    for (const skill of PROGRESS_SKILLS) {
      const entry = readProgressEntry(row, colIndex, skill);
      if (entry) {
        const key = skillKey(wordId, skill);
        result.set(key, { ...entry, wordId: key });
      }
    }
  }

  return result;
}

/**
 * WordEntry 배열을 CSV 문자열로 직렬화한다 (드라이브에 다시 저장할 때 사용).
 * progress를 넘기면(skillKey로 색인된 Map) 각 단어의 진도도 진도 컬럼에 같이 써넣는다 —
 * 안 넘기면(생성/업로드 등 아직 진도가 없는 경우) 진도 컬럼은 전부 빈 칸으로 나간다.
 */
export function serializeWordBankCsv(words: WordEntry[], progress?: Map<string, ProgressEntry>): string {
  const header = [
    'kanji',
    'reading',
    'meaning',
    'jlpt_level',
    'notes',
    ...PROGRESS_SKILLS.flatMap((skill) => Object.values(progressColumnNames(skill))),
  ];
  const lines = [header.join(',')];

  for (const w of words) {
    const fields = [w.kanji, w.reading, w.meaning, w.jlptLevel ?? '', w.notes ?? ''];
    for (const skill of PROGRESS_SKILLS) {
      const entry = progress?.get(skillKey(w.id, skill));
      fields.push(
        entry ? String(entry.ease) : '',
        entry ? String(entry.intervalMinutes) : '',
        entry ? String(entry.reps) : '',
        entry ? String(entry.lapses) : '',
        entry?.lastReviewedAt ?? '',
        entry?.nextReviewAt ?? ''
      );
    }
    lines.push(fields.map(escapeCsvField).join(','));
  }

  return lines.join('\n');
}
