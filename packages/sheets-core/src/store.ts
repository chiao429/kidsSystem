import type { RowOf, TableDef } from '@kids/schema';

/** replaceWhere 的條件：欄位等於某值，或屬於某些值 */
export type RowFilter<T extends TableDef> = Partial<Record<T['headers'][number], string | { $in: string[] }>>;

export interface UpsertResult<T extends TableDef> {
  created: boolean;
  /** 更新前的列；新建時為 undefined */
  before?: RowOf<T>;
  row: RowOf<T>;
}

/**
 * 單一表（在某個 scope 內）的底層存取。權限、快取由 SheetTable 負責。
 * scope：master 表固定 'master'；event 表為活動ID。
 */
export interface TableStore<T extends TableDef> {
  all(): Promise<RowOf<T>[]>;
  append(rows: Partial<RowOf<T>>[]): Promise<void>;
  updateByIds(patches: { id: string; changes: Partial<RowOf<T>> }[]): Promise<{ notFound: string[] }>;
  deleteByIds(ids: string[]): Promise<void>;
  replaceWhere(filter: RowFilter<T> | null, rows: Partial<RowOf<T>>[]): Promise<void>;
  /** 不存在時新增 row；已存在時只更新 onUpdate（未提供則為 row 去掉主鍵） */
  upsertByKey(keyColumns: T['headers'][number][], row: Partial<RowOf<T>>, onUpdate?: Partial<RowOf<T>>): Promise<UpsertResult<T>>;
  ensure(): Promise<void>;
}

export function matchesFilter<T extends TableDef>(row: Partial<RowOf<T>>, filter: RowFilter<T> | null): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([k, cond]) => {
    const v = String((row as Record<string, string | undefined>)[k] ?? '');
    if (cond && typeof cond === 'object') return (cond as { $in: string[] }).$in.includes(v);
    return v === cond;
  });
}

export function keyOf(row: Record<string, string | undefined>, keys: string[]): string {
  return keys.map((k) => String(row[k] ?? '')).join('\u0001');
}

/** 補齊所有標題欄位為字串 */
export function normalizeRow<T extends TableDef>(def: T, raw: Record<string, unknown>): RowOf<T> {
  const row = {} as Record<string, string>;
  for (const h of def.headers) row[h] = raw[h] == null ? '' : String(raw[h]);
  return row as RowOf<T>;
}
