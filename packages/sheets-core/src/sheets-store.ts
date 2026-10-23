import type { RowOf, TableDef } from '@kids/schema';
import { getBackend } from './backend';
import { keyOf, matchesFilter, type RowFilter, type TableStore, type UpsertResult } from './store';

interface Snapshot<T extends TableDef> {
  /** 實際 Sheet 上的標題列（順序以 Sheet 為準） */
  headerRow: string[];
  rows: RowOf<T>[];
  /** ID → Sheet 列號（1 起算，含標題列） */
  rowNumberById: Map<string, number>;
}

/**
 * 以 Google Sheets（或 SHEETS_LOCAL_DIR 的 JSON）為儲存的實作。
 * - 讀：整張讀回後轉成 { 標題: 值 }
 * - 新增：append，不覆寫既有列
 * - 更新：依 ID 找列號，只寫入有變動的欄位（一次 batchUpdate）
 */
export class SheetsStore<T extends TableDef> implements TableStore<T> {
  constructor(
    private readonly spreadsheetId: () => Promise<string>,
    readonly def: T,
  ) {}

  private async snapshot(): Promise<Snapshot<T> & { id: string }> {
    const id = await this.spreadsheetId();
    if (!id) throw new Error(`分頁「${this.def.tab}」沒有設定試算表 ID`);
    const values = await getBackend().values(id, this.def.tab);
    const headerRow = (values[0] ?? []).map((h) => String(h).trim());
    const missing = this.def.headers.filter((h) => !headerRow.includes(h));
    if (missing.length > 0) {
      throw new Error(`分頁「${this.def.tab}」缺少欄位：${missing.join('、')}（請到後台執行「建立 / 檢查分頁」）`);
    }

    const idCol = headerRow.indexOf(this.def.idColumn);
    const rows: RowOf<T>[] = [];
    const rowNumberById = new Map<string, number>();
    values.slice(1).forEach((raw, i) => {
      const rid = String(raw[idCol] ?? '').trim();
      if (!rid) return;
      const row = {} as Record<string, string>;
      headerRow.forEach((h, c) => {
        row[h] = raw[c] == null ? '' : String(raw[c]);
      });
      rows.push(row as RowOf<T>);
      rowNumberById.set(rid, i + 2);
    });
    return { id, headerRow, rows, rowNumberById };
  }

  async all(): Promise<RowOf<T>[]> {
    return (await this.snapshot()).rows;
  }

  private toValues(headerRow: string[], rows: Partial<RowOf<T>>[]): string[][] {
    return rows.map((r) => headerRow.map((h) => String((r as Record<string, string | undefined>)[h] ?? '')));
  }

  async append(rows: Partial<RowOf<T>>[]): Promise<void> {
    if (rows.length === 0) return;
    const { id, headerRow } = await this.snapshot();
    await getBackend().appendRows(id, this.def.tab, this.toValues(headerRow, rows));
  }

  async updateByIds(patches: { id: string; changes: Partial<RowOf<T>> }[]): Promise<{ notFound: string[] }> {
    if (patches.length === 0) return { notFound: [] };
    const { id: sheetId, headerRow, rowNumberById } = await this.snapshot();
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
    if (cells.length > 0) await getBackend().setCells(sheetId, this.def.tab, cells);
    return { notFound };
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { id, rowNumberById } = await this.snapshot();
    const rowNumbers = ids.map((x) => rowNumberById.get(x)).filter((n): n is number => !!n);
    if (rowNumbers.length > 0) await getBackend().deleteRows(id, this.def.tab, rowNumbers);
  }

  async replaceWhere(filter: RowFilter<T> | null, rows: Partial<RowOf<T>>[]): Promise<void> {
    const { id, headerRow, rows: existing } = await this.snapshot();
    const kept = existing.filter((r) => !matchesFilter(r, filter));
    await getBackend().replaceData(id, this.def.tab, this.toValues(headerRow, [...kept, ...rows]));
  }

  async upsertByKey(keyColumns: T['headers'][number][], row: Partial<RowOf<T>>, onUpdate?: Partial<RowOf<T>>): Promise<UpsertResult<T>> {
    const existing = (await this.snapshot()).rows;
    const k = keyOf(row as Record<string, string>, keyColumns);
    const before = existing.find((r) => keyOf(r as Record<string, string>, keyColumns) === k);
    const idCol = this.def.idColumn as keyof RowOf<T>;
    if (before) {
      const changes = { ...(onUpdate ?? row) } as Partial<RowOf<T>>;
      delete changes[idCol];
      await this.updateByIds([{ id: String(before[idCol]), changes }]);
      return { created: false, before, row: { ...before, ...changes } };
    }
    await this.append([row]);
    return { created: true, row: row as RowOf<T> };
  }

  /** 若分頁不存在則建立並寫入標題列；既有分頁缺少新欄位時補在最後面，不動既有欄位 */
  async ensure(): Promise<void> {
    const id = await this.spreadsheetId();
    const backend = getBackend();
    const existing = await backend.ensureTab(id, this.def.tab);
    if (existing.length === 0) {
      await backend.setHeader(id, this.def.tab, 0, [...this.def.headers]);
    } else {
      const missing = this.def.headers.filter((h) => !existing.includes(h));
      if (missing.length > 0) await backend.setHeader(id, this.def.tab, existing.length, missing);
    }
  }
}
