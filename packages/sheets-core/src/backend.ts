import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getSheetsClient } from './client';

/** 一個試算表分頁的底層操作。列號 1 起算（1 = 標題列），欄號 0 起算 */
export interface Backend {
  values(spreadsheetId: string, tab: string): Promise<string[][]>;
  appendRows(spreadsheetId: string, tab: string, rows: string[][]): Promise<void>;
  setCells(spreadsheetId: string, tab: string, cells: { row: number; col: number; value: string }[]): Promise<void>;
  deleteRows(spreadsheetId: string, tab: string, rowNumbers: number[]): Promise<void>;
  replaceData(spreadsheetId: string, tab: string, rows: string[][]): Promise<void>;
  /** 分頁不存在則建立；回傳目前標題列 */
  ensureTab(spreadsheetId: string, tab: string): Promise<string[]>;
  setHeader(spreadsheetId: string, tab: string, startCol: number, headers: string[]): Promise<void>;
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const q = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

const googleBackend: Backend = {
  async values(id, tab) {
    const res = await getSheetsClient().spreadsheets.values.get({ spreadsheetId: id, range: q(tab) });
    return ((res.data.values ?? []) as unknown[][]).map((r) => r.map((v) => (v == null ? '' : String(v))));
  },
  async appendRows(id, tab, rows) {
    await getSheetsClient().spreadsheets.values.append({
      spreadsheetId: id,
      range: `${q(tab)}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: rows },
    });
  },
  async setCells(id, tab, cells) {
    await getSheetsClient().spreadsheets.values.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        valueInputOption: 'RAW',
        data: cells.map((c) => ({ range: `${q(tab)}!${columnLetter(c.col)}${c.row}`, values: [[c.value]] })),
      },
    });
  },
  async deleteRows(id, tab, rowNumbers) {
    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties' });
    const gid = meta.data.sheets?.find((s) => s.properties?.title === tab)?.properties?.sheetId;
    if (gid == null) throw new Error(`找不到分頁「${tab}」`);
    const sorted = [...rowNumbers].sort((a, b) => b - a); // 由下往上刪，列號才不會位移
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: sorted.map((n) => ({
          deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: n - 1, endIndex: n } },
        })),
      },
    });
  },
  async replaceData(id, tab, rows) {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.clear({ spreadsheetId: id, range: `${q(tab)}!A2:ZZ` });
    if (rows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range: `${q(tab)}!A2`,
        valueInputOption: 'RAW',
        requestBody: { values: rows },
      });
    }
  },
  async ensureTab(id, tab) {
    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties' });
    if (!meta.data.sheets?.some((s) => s.properties?.title === tab)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
      });
      return [];
    }
    const head = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${q(tab)}!1:1` });
    return (head.data.values?.[0] ?? []).map((h) => String(h).trim());
  },
  async setHeader(id, tab, startCol, headers) {
    await getSheetsClient().spreadsheets.values.update({
      spreadsheetId: id,
      range: `${q(tab)}!${columnLetter(startCol)}1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  },
};

/**
 * 本機開發/測試用：每個試算表存成 <SHEETS_LOCAL_DIR>/<spreadsheetId>.json
 * 多個 app 指向同一個目錄即可共用資料。
 */
function localBackend(dir: string): Backend {
  type Book = Record<string, string[][]>;
  const file = (id: string) => path.join(dir, `${id.replace(/[^\w-]/g, '_')}.json`);
  const load = async (id: string): Promise<Book> => {
    try {
      return JSON.parse(await fs.readFile(file(id), 'utf8')) as Book;
    } catch {
      return {};
    }
  };
  const save = async (id: string, book: Book) => {
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${file(id)}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(book, null, 1));
    await fs.rename(tmp, file(id));
  };
  const mutate = async (id: string, tab: string, fn: (rows: string[][]) => string[][] | void) => {
    const book = await load(id);
    if (!book[tab]) throw new Error(`找不到分頁「${tab}」`);
    const next = fn(book[tab]);
    if (next) book[tab] = next;
    await save(id, book);
  };
  return {
    async values(id, tab) {
      const book = await load(id);
      if (!book[tab]) throw new Error(`找不到分頁「${tab}」`);
      return book[tab];
    },
    appendRows: (id, tab, rows) => mutate(id, tab, (all) => void all.push(...rows)),
    setCells: (id, tab, cells) =>
      mutate(id, tab, (all) => {
        for (const c of cells) {
          const row = (all[c.row - 1] ??= []);
          while (row.length < c.col) row.push('');
          row[c.col] = c.value;
        }
      }),
    deleteRows: (id, tab, rowNumbers) =>
      mutate(id, tab, (all) => all.filter((_, i) => !rowNumbers.includes(i + 1))),
    replaceData: (id, tab, rows) => mutate(id, tab, (all) => [all[0] ?? [], ...rows]),
    async ensureTab(id, tab) {
      const book = await load(id);
      if (!book[tab]) {
        book[tab] = [];
        await save(id, book);
      }
      return (book[tab][0] ?? []).map((h) => String(h).trim());
    },
    setHeader: (id, tab, startCol, headers) =>
      mutate(id, tab, (all) => {
        const head = (all[0] ??= []);
        headers.forEach((h, i) => (head[startCol + i] = h));
      }),
  };
}

/** 指定來源的 backend（搬遷用）：sheets = Google Sheets；local = SHEETS_LOCAL_DIR 的 JSON */
export function backendFor(source: 'sheets' | 'local'): Backend {
  if (source === 'sheets') return googleBackend;
  const dir = process.env.SHEETS_LOCAL_DIR;
  if (!dir) throw new Error('SHEETS_LOCAL_DIR 未設定');
  return localBackend(path.resolve(dir));
}

let backend: Backend | null = null;

export function getBackend(): Backend {
  if (!backend) {
    const dir = process.env.SHEETS_LOCAL_DIR;
    backend = dir ? localBackend(path.resolve(dir)) : googleBackend;
  }
  return backend;
}
