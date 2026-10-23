import { EventTable, isOwner, type RowOf, type SystemName, type TableDef } from '@kids/schema';
import { getBackend } from './backend';
import { cached, invalidate } from './cache';
import { extractSheetIdFromUrl } from './client';
import { MongoStore } from './mongo';
import { SheetsStore } from './sheets-store';
import { matchesFilter, type RowFilter, type TableStore, type UpsertResult } from './store';

export type DataBackend = 'mongo' | 'sheets';

/** DATA_BACKEND=mongo 用 MongoDB；其餘用 Google Sheets（設了 SHEETS_LOCAL_DIR 則為本機 JSON） */
export const dataBackend = (): DataBackend => (process.env.DATA_BACKEND === 'mongo' ? 'mongo' : 'sheets');

const masterSheetId = () => process.env.GOOGLE_MASTER_SHEET_ID ?? '';

/** scope → 試算表 ID（master 為主資料試算表；活動為「活動試算表」欄） */
export async function resolveSheetId(scope: string): Promise<string> {
  if (scope === 'master') return masterSheetId();
  return cached(`sheetId:${scope}`, 60_000, async () => {
    const values = await getBackend().values(masterSheetId(), EventTable.tab);
    const head = (values[0] ?? []).map((h) => String(h).trim());
    const idCol = head.indexOf(EventTable.idColumn);
    const urlCol = head.indexOf('活動試算表');
    const row = values.slice(1).find((r) => String(r[idCol] ?? '').trim() === scope);
    const id = row ? extractSheetIdFromUrl(String(row[urlCol] ?? '')) : '';
    if (!id) throw new Error(`找不到活動 ${scope} 的活動試算表`); // 不快取找不到的結果
    return id;
  });
}

export class PermissionError extends Error {}

/**
 * 依標題名稱讀寫單一表，並強制資料歸屬規則：
 * - 新增、刪除、取代、upsert 新建：只有 owner（依類型決定時看每列的類型值）
 * - 更新既有列：owner 不限欄位；其他系統只能改 updatableBy[actor]
 * - 日誌表所有系統皆可 append
 * - READ_ONLY=1 時拒絕所有寫入（正式切換期間）
 */
export class SheetTable<T extends TableDef> {
  private readonly store: TableStore<T>;
  private readonly ttlMs: number;

  constructor(
    readonly scope: string,
    readonly def: T,
    readonly actor: SystemName,
    opts: { ttlMs?: number } = {},
  ) {
    if (def.scope === 'master' && scope !== 'master') throw new Error(`「${def.tab}」是主資料表，scope 必須為 master`);
    if (!scope) throw new Error(`「${def.tab}」沒有指定活動`);
    const mongo = dataBackend() === 'mongo';
    this.store = mongo ? new MongoStore(scope, def) : new SheetsStore(() => resolveSheetId(scope), def);
    this.ttlMs = opts.ttlMs ?? (mongo ? 2_000 : 10_000);
  }

  private get cacheKey() {
    return `${this.def.key}:${this.scope}`;
  }

  private assertWritable() {
    if (process.env.READ_ONLY === '1') throw new Error('系統維護中，暫停寫入');
  }

  private deny(what: string): never {
    throw new PermissionError(`權限錯誤：${this.actor} 不可修改「${this.def.tab}.${what}」`);
  }

  private assertOwnerOf(rows: Partial<RowOf<T>>[]) {
    if (this.def.key === 'logs') return;
    for (const r of rows) {
      if (!isOwner(this.def, this.actor, r as Record<string, string>)) {
        const by = typeof this.def.owner === 'string' ? '' : (r as Record<string, string>)[this.def.owner.byColumn] ?? '';
        this.deny(by || '新增/刪除');
      }
    }
  }

  private written() {
    invalidate(this.cacheKey);
  }

  async all(opts: { fresh?: boolean } = {}): Promise<RowOf<T>[]> {
    if (opts.fresh) invalidate(this.cacheKey);
    return cached(this.cacheKey, this.ttlMs, () => this.store.all());
  }

  async findById(id: string, opts: { fresh?: boolean } = {}): Promise<RowOf<T> | undefined> {
    const rows = await this.all(opts);
    return rows.find((r) => r[this.def.idColumn as keyof RowOf<T>] === id);
  }

  async append(rows: Partial<RowOf<T>>[]): Promise<void> {
    if (rows.length === 0) return;
    this.assertWritable();
    this.assertOwnerOf(rows);
    await this.store.append(rows);
    this.written();
  }

  /** 依 ID 批次更新指定欄位；找不到的 ID 會回傳在 notFound */
  async updateByIds(patches: { id: string; changes: Partial<RowOf<T>> }[]): Promise<{ notFound: string[] }> {
    if (patches.length === 0) return { notFound: [] };
    this.assertWritable();
    const allowed = (this.def.updatableBy?.[this.actor] ?? []) as string[];
    const needsRow = typeof this.def.owner !== 'string';
    const current = needsRow ? new Map((await this.all({ fresh: true })).map((r) => [String(r[this.def.idColumn as keyof RowOf<T>]), r])) : null;
    for (const p of patches) {
      const owner = isOwner(this.def, this.actor, (current?.get(p.id) ?? {}) as Record<string, string>);
      if (owner) {
        // 依類型決定擁有者時，不可把列改成自己不擁有的類型
        if (needsRow && !isOwner(this.def, this.actor, { ...(current?.get(p.id) ?? {}), ...p.changes } as Record<string, string>)) {
          this.deny(String((p.changes as Record<string, string>)[(this.def.owner as { byColumn: string }).byColumn]));
        }
        continue;
      }
      for (const k of Object.keys(p.changes)) if (!allowed.includes(k)) this.deny(k);
    }
    const res = await this.store.updateByIds(patches);
    this.written();
    return res;
  }

  /** 依 ID 刪除（owner 才可以） */
  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    this.assertWritable();
    const rows = await this.all({ fresh: true });
    const targets = rows.filter((r) => ids.includes(String(r[this.def.idColumn as keyof RowOf<T>])));
    if (typeof this.def.owner === 'string') this.assertOwnerOf([{}]);
    this.assertOwnerOf(targets);
    await this.store.deleteByIds(ids);
    this.written();
  }

  /** 清空資料並整批寫入（owner 才可以） */
  async replaceAll(rows: Partial<RowOf<T>>[]): Promise<void> {
    await this.replaceWhere(null, rows);
  }

  /** 只取代符合條件的列，例如重新分隊時只換掉某區域的小隊隊員 */
  async replaceWhere(filter: RowFilter<T> | null, rows: Partial<RowOf<T>>[]): Promise<void> {
    this.assertWritable();
    const removed = (await this.all({ fresh: true })).filter((r) => matchesFilter(r, filter));
    this.assertOwnerOf([...removed, ...rows]);
    if (typeof this.def.owner === 'string') this.assertOwnerOf([{}]);
    await this.store.replaceWhere(filter, rows);
    this.written();
  }

  /**
   * 依唯一鍵新增或更新一列。新建需為 owner；更新既有列的規則同 updateByIds。
   * row 需包含主鍵（新建時使用）。
   */
  async upsertByKey(keyColumns: T['headers'][number][], row: Partial<RowOf<T>>, onUpdate?: Partial<RowOf<T>>): Promise<UpsertResult<T>> {
    this.assertWritable();
    this.assertOwnerOf([row]);
    const res = await this.store.upsertByKey(keyColumns, row, onUpdate);
    this.written();
    return res;
  }

  async upsertManyByKey(keyColumns: T['headers'][number][], rows: Partial<RowOf<T>>[]): Promise<UpsertResult<T>[]> {
    const out: UpsertResult<T>[] = [];
    for (const r of rows) out.push(await this.upsertByKey(keyColumns, r));
    return out;
  }

  /** mongo：建立索引；sheets：建立分頁與標題列 */
  async ensure(): Promise<void> {
    await this.store.ensure();
    this.written();
  }
}
