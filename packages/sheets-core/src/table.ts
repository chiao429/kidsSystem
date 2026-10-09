import type { TableDef, RowOf } from '@kids/schema';
import { getBackend } from './backend';
import { cached, invalidate } from './cache';

const DEFAULT_TTL_MS = 10_000;

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
    if (!this.spreadsheetId) throw new Error(`分頁「${this.def.tab}」沒有設定試算表 ID`);
    if (fresh) invalidate(this.cacheKey);
    return cached(this.cacheKey, this.ttlMs, async () => {
      const values = await getBackend().values(this.spreadsheetId, this.def.tab);
      const headerRow = (values[0] ?? []).map((h) => String(h).trim());
      const missing = this.def.headers.filter((h) => !headerRow.includes(h));
      if (missing.length > 0) {
        throw new Error(`分頁「${this.def.tab}」缺少欄位：${missing.join('、')}（請到後台執行「建立 / 檢查分頁」）`);
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

  private toValues(headerRow: string[], rows: Partial<RowOf<T>>[]): string[][] {
    return rows.map((r) => headerRow.map((h) => String((r as Record<string, string | undefined>)[h] ?? '')));
  }

  async append(rows: Partial<RowOf<T>>[]): Promise<void> {
    if (rows.length === 0) return;
    const { headerRow } = await this.snapshot();
    await getBackend().appendRows(this.spreadsheetId, this.def.tab, this.toValues(headerRow, rows));
    invalidate(this.cacheKey);
  }

  /** 依 ID 批次更新指定欄位；找不到的 ID 會回傳在 notFound */
  async updateByIds(
    patches: { id: string; changes: Partial<RowOf<T>> }[],
  ): Promise<{ notFound: string[] }> {
    if (patches.length === 0) return { notFound: [] };
    // 寫入前一律重新讀取，避免用到過期的列號
    const { headerRow, rowNumberById } = await this.snapshot(true);
    const cells: { row: number; col: number; value: string }[] = [];
    const notFound: string[] = [];

    for (const { id, changes } of patches) {
      const row = rowNumberById.get(id);
      if (!row) {
        notFound.push(id);
        continue;
      }
      for (const [header, value] of Object.entries(changes)) {
        if (header === this.def.idColumn) continue;
        const col = headerRow.indexOf(header);
        if (col < 0) throw new Error(`分頁「${this.def.tab}」沒有欄位「${header}」`);
        cells.push({ row, col, value: String(value ?? '') });
      }
    }

    if (cells.length > 0) {
      await getBackend().setCells(this.spreadsheetId, this.def.tab, cells);
      invalidate(this.cacheKey);
    }
    return { notFound };
  }

  /** 依 ID 刪除整列（僅 owner 系統使用） */
  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { rowNumberById } = await this.snapshot(true);
    const rowNumbers = ids.map((id) => rowNumberById.get(id)).filter((n): n is number => !!n);
    if (rowNumbers.length === 0) return;
    await getBackend().deleteRows(this.spreadsheetId, this.def.tab, rowNumbers);
    invalidate(this.cacheKey);
  }

  /** 清空資料列並整批寫入（保留標題列；僅 owner 系統使用，例如重新分隊） */
  async replaceAll(rows: Partial<RowOf<T>>[]): Promise<void> {
    const { headerRow } = await this.snapshot(true);
    await getBackend().replaceData(this.spreadsheetId, this.def.tab, this.toValues(headerRow, rows));
    invalidate(this.cacheKey);
  }

  /** 若分頁不存在則建立並寫入標題列；既有分頁缺少新欄位時補在最後面，不動既有欄位 */
  async ensure(): Promise<void> {
    const backend = getBackend();
    const existing = await backend.ensureTab(this.spreadsheetId, this.def.tab);
    if (existing.length === 0) {
      await backend.setHeader(this.spreadsheetId, this.def.tab, 0, [...this.def.headers]);
    } else {
      const missing = this.def.headers.filter((h) => !existing.includes(h));
      if (missing.length > 0) await backend.setHeader(this.spreadsheetId, this.def.tab, existing.length, missing);
    }
    invalidate(this.cacheKey);
  }
}
