import type { TableDef, RowOf } from '@easyevent/schema';
import { getSheetsClient } from './client';
import { cached, invalidate } from './cache';

const DEFAULT_TTL_MS = 10_000;

/** 欄號（0 起算）轉 A1 欄名 */
function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

interface Snapshot<T extends TableDef> {
  /** 實際 Sheet 上的標題列（順序以 Sheet 為準） */
  headerRow: string[];
  rows: RowOf<T>[];
  /** ID → Sheet 列號（1 起算，含標題列） */
  rowNumberById: Map<string, number>;
}

/**
 * 以標題名稱讀寫單一分頁。
 * - 讀：整張讀回後轉成 { 標題: 值 }，有短暫快取
 * - 新增：append，不覆寫既有列
 * - 更新：依 ID 找列號，只寫入有變動的欄位（一次 batchUpdate）
 */
export class SheetTable<T extends TableDef> {
  constructor(
    readonly spreadsheetId: string,
    readonly def: T,
    private readonly ttlMs = DEFAULT_TTL_MS,
  ) {}

  private get cacheKey() {
    return `${this.spreadsheetId}:${this.def.tab}`;
  }

  private async snapshot(fresh = false): Promise<Snapshot<T>> {
    if (fresh) invalidate(this.cacheKey);
    return cached(this.cacheKey, this.ttlMs, async () => {
      const res = await getSheetsClient().spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `'${this.def.tab}'`,
      });
      const values = (res.data.values ?? []) as string[][];
      const headerRow = (values[0] ?? []).map((h) => String(h).trim());
      const missing = this.def.headers.filter((h) => !headerRow.includes(h));
      if (missing.length > 0) {
        throw new Error(`分頁「${this.def.tab}」缺少欄位：${missing.join('、')}`);
      }

      const idCol = headerRow.indexOf(this.def.idColumn);
      const rows: RowOf<T>[] = [];
      const rowNumberById = new Map<string, number>();
      values.slice(1).forEach((raw, i) => {
        const id = String(raw[idCol] ?? '').trim();
        if (!id) return;
        const row = {} as Record<string, string>;
        headerRow.forEach((h, c) => {
          row[h] = raw[c] == null ? '' : String(raw[c]);
        });
        rows.push(row as RowOf<T>);
        rowNumberById.set(id, i + 2);
      });
      return { headerRow, rows, rowNumberById };
    });
  }

  async all(opts: { fresh?: boolean } = {}): Promise<RowOf<T>[]> {
    return (await this.snapshot(opts.fresh)).rows;
  }

  async findById(id: string, opts: { fresh?: boolean } = {}): Promise<RowOf<T> | undefined> {
    const rows = await this.all(opts);
    return rows.find((r) => r[this.def.idColumn as keyof RowOf<T>] === id);
  }

  async append(rows: Partial<RowOf<T>>[]): Promise<void> {
    if (rows.length === 0) return;
    const { headerRow } = await this.snapshot();
    const values = rows.map((r) =>
      headerRow.map((h) => (r as Record<string, string | undefined>)[h] ?? ''),
    );
    await getSheetsClient().spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.def.tab}'!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });
    invalidate(this.cacheKey);
  }

  /** 依 ID 批次更新指定欄位；找不到的 ID 會回傳在 notFound */
  async updateByIds(
    patches: { id: string; changes: Partial<RowOf<T>> }[],
  ): Promise<{ notFound: string[] }> {
    if (patches.length === 0) return { notFound: [] };
    // 寫入前一律重新讀取，避免用到過期的列號
    const { headerRow, rowNumberById } = await this.snapshot(true);
    const data: { range: string; values: string[][] }[] = [];
    const notFound: string[] = [];

    for (const { id, changes } of patches) {
      const rowNumber = rowNumberById.get(id);
      if (!rowNumber) {
        notFound.push(id);
        continue;
      }
      for (const [header, value] of Object.entries(changes)) {
        if (header === this.def.idColumn) continue;
        const col = headerRow.indexOf(header);
        if (col < 0) throw new Error(`分頁「${this.def.tab}」沒有欄位「${header}」`);
        data.push({
          range: `'${this.def.tab}'!${columnLetter(col)}${rowNumber}`,
          values: [[String(value ?? '')]],
        });
      }
    }

    if (data.length > 0) {
      await getSheetsClient().spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: { valueInputOption: 'USER_ENTERED', data },
      });
      invalidate(this.cacheKey);
    }
    return { notFound };
  }

  /** 若分頁不存在則建立，並寫入標題列 */
  async ensure(): Promise<void> {
    const sheets = getSheetsClient();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const exists = meta.data.sheets?.some((s) => s.properties?.title === this.def.tab);
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: this.def.tab } } }] },
      });
    }
    const head = await sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${this.def.tab}'!1:1`,
    });
    if (!head.data.values?.[0]?.length) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `'${this.def.tab}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [[...this.def.headers]] },
      });
    }
    invalidate(this.cacheKey);
  }
}
