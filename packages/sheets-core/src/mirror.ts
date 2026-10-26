import {
  ALL_TABLES, EventTable, GroupMemberTable, GroupTable, LogTable,
  LEARNER_ROLES, RegistrationTable, newId, nowString, type TableDef,
} from '@kids/schema';
import { getBackend } from './backend';
import { extractSheetIdFromUrl } from './client';
import { getMasterSheetId, isSheetSyncPaused } from './settings';
import { collectionOf, docId, getDb, type StoredDoc } from './mongo';
import { normalizeRow } from './store';
import { SheetTable } from './table';

/**
 * MongoDB → Google Sheet 鏡像（只給 admin 使用）。
 * 可靠性：
 * - 業務欄位與 _dirty/_ver 在同一次寫入中更新（見 mongo.ts）
 * - 推送後只清除「版本沒變」的 _dirty，推送期間的新修改會留到下一輪
 * - 以 _sync_locks 防止多個觸發同時推送
 */

const LOCK_MS = 2 * 60_000;
const DEPENDENTS_OF_GROUPS = ['groupMembers', 'checkins', 'attendance', 'schedules', 'registrations'];

type Row = Record<string, string>;

export interface PushResult {
  skipped?: 'locked' | 'paused';
  tables: { table: string; scope: string; rows?: number; error?: string }[];
  remaining: number;
}

const defByKey = new Map<string, TableDef>(ALL_TABLES.map((d) => [d.key, d as TableDef]));
const defByTab = new Map<string, TableDef>(ALL_TABLES.map((d) => [d.tab, d as TableDef]));

async function acquireLock(): Promise<boolean> {
  const locks = (await getDb()).collection<{ _id: string; lockedUntil: Date }>('_sync_locks');
  const now = new Date();
  try {
    await locks.findOneAndUpdate(
      { _id: 'mirror', $or: [{ lockedUntil: { $lt: now } }, { lockedUntil: { $exists: false } }] },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
      { upsert: true },
    );
    return true;
  } catch {
    return false; // 已被鎖住（upsert 撞到既有 _id）
  }
}

async function releaseLock() {
  await (await getDb()).collection<{ _id: string }>('_sync_locks').deleteOne({ _id: 'mirror' });
}

/** scope → 鏡像目的地試算表 ID */
export async function mirrorSheetId(scope: string): Promise<string> {
  if (scope === 'master') return getMasterSheetId();
  const ev = await (await collectionOf(EventTable)).findOne({ _id: docId('master', scope), _deleted: false });
  return ev ? extractSheetIdFromUrl(String(ev['活動試算表'] ?? '')) : '';
}

function isRetryable(e: unknown): boolean {
  const err = e as { code?: number | string; status?: number; response?: { status?: number } };
  const status = Number(err.response?.status ?? err.status ?? err.code);
  return status === 429 || (status >= 500 && status < 600);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= 3 || !isRetryable(e)) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}

/** 計算 displayColumns 需要的對照表（每個 scope 載入一次） */
class DisplayContext {
  private groups?: Map<string, Row>;
  private coursesByReg?: Map<string, string>;

  constructor(private readonly scope: string) {}

  private async active(def: TableDef, scope: string): Promise<Row[]> {
    const docs = await (await collectionOf(def)).find({ _scope: scope, _deleted: false }).sort({ _ord: 1 }).toArray();
    return docs.map((d) => normalizeRow(def, d) as Row);
  }

  async groupName(id: string): Promise<string> {
    this.groups ??= new Map((await this.active(GroupTable, this.scope)).map((g) => [g['分組ID'], g]));
    return this.groups.get(id)?.['名稱'] ?? '';
  }

  async coursesOf(regId: string): Promise<string> {
    if (!this.coursesByReg) {
      this.coursesByReg = new Map();
      const gm = await this.active(GroupMemberTable, this.scope);
      for (const m of gm) {
        if (m['類型'] !== '課程' || !LEARNER_ROLES.includes(m['角色']) || !m['報名ID']) continue;
        const name = await this.groupName(m['分組ID']);
        const prev = this.coursesByReg.get(m['報名ID']);
        this.coursesByReg.set(m['報名ID'], prev ? `${prev}、${name}` : name);
      }
    }
    return this.coursesByReg.get(regId) ?? '';
  }

  async value(def: TableDef, column: string, row: Row): Promise<string> {
    if (column === '分組名稱') return this.groupName(row['分組ID'] ?? '');
    if (column === '課程' && def.key === RegistrationTable.key) return this.coursesOf(row['報名ID'] ?? '');
    return '';
  }
}

/** 把一個（表, scope）的有效資料寫到 Sheet；依 ID 對列，保留 schema 以外的手動欄位 */
async function writeTable(def: TableDef, sheetId: string, docs: StoredDoc[], ctx: DisplayContext): Promise<number> {
  const backend = getBackend();
  const exclude = new Set<string>(def.mirrorExclude ?? []);
  const wanted = [...def.headers, ...(def.displayColumns ?? [])].filter((h) => !exclude.has(h));

  let header = await withRetry(() => backend.ensureTab(sheetId, def.tab));
  const missing = wanted.filter((h) => !header.includes(h));
  if (header.length === 0 || missing.length > 0) {
    await withRetry(() => backend.setHeader(sheetId, def.tab, header.length, missing.length ? missing : wanted));
    header = [...header, ...(missing.length ? missing : wanted)];
  }

  const values = await withRetry(() => backend.values(sheetId, def.tab));
  const idCol = header.indexOf(def.idColumn);
  const existing = new Map<string, string[]>();
  const order: string[] = [];
  for (const raw of values.slice(1)) {
    const id = String(raw[idCol] ?? '').trim();
    if (!id) continue;
    existing.set(id, raw.map((v) => String(v ?? '')));
    order.push(id);
  }

  const active = docs.filter((d) => !d._deleted);
  const deleted = new Set(docs.filter((d) => d._deleted).map((d) => String(d[def.idColumn])));
  const known = new Set<string>(def.headers as readonly string[]);
  const display = new Set(def.displayColumns ?? []);
  const byId = new Map(active.map((d) => [String(d[def.idColumn]), normalizeRow(def, d) as Row]));

  const ids = [...order.filter((id) => !deleted.has(id)), ...[...byId.keys()].filter((id) => !existing.has(id))];
  const out: string[][] = [];
  for (const id of ids) {
    const row = byId.get(id);
    const prev = existing.get(id) ?? [];
    if (!row) {
      out.push(prev); // Sheet 上有、資料庫沒有的列（例如人工加入）：原樣保留
      continue;
    }
    const line: string[] = [];
    for (let c = 0; c < header.length; c++) {
      const h = header[c];
      if (exclude.has(h)) line.push('');
      else if (display.has(h)) line.push(await ctx.value(def, h, row));
      else if (known.has(h)) line.push(row[h] ?? '');
      else line.push(prev[c] ?? '');
    }
    out.push(line);
  }
  await withRetry(() => backend.replaceData(sheetId, def.tab, out));
  return active.length;
}

async function recordState(def: TableDef, scope: string, ok: boolean, error = '') {
  const state = (await getDb()).collection<{ _id: string }>('_sync_state');
  await state.updateOne(
    { _id: `${def.key}:${scope}` },
    ok
      ? { $set: { table: def.key, scope, lastSuccessAt: new Date(), lastError: '', failures: 0 } }
      : { $set: { table: def.key, scope, lastError: error.slice(0, 500), lastErrorAt: new Date() }, $inc: { failures: 1 } },
    { upsert: true },
  );
}

/** 推送所有待同步的（表, scope）；受批次與時間上限限制，剩下的留到下一輪 */
export async function pushDirty({ maxTables = 20, timeBudgetMs = 50_000 } = {}): Promise<PushResult> {
  if (await isSheetSyncPaused()) return { skipped: 'paused', tables: [], remaining: 0 };
  if (!(await acquireLock())) return { skipped: 'locked', tables: [], remaining: 0 };
  const started = Date.now();
  const result: PushResult = { tables: [], remaining: 0 };
  try {
    // 分組名稱改變時，依賴它的表也要重新推送
    const groupsCol = await collectionOf(GroupTable);
    for (const scope of await groupsCol.distinct('_scope', { _dirty: true })) {
      for (const key of DEPENDENTS_OF_GROUPS) {
        await (await getDb()).collection(key).updateMany({ _scope: scope }, { $set: { _dirty: true } });
      }
    }
    const gmCol = await collectionOf(GroupMemberTable);
    for (const scope of await gmCol.distinct('_scope', { _dirty: true })) {
      await (await collectionOf(RegistrationTable)).updateMany({ _scope: scope }, { $set: { _dirty: true } });
    }

    const pairs: { def: TableDef; scope: string }[] = [];
    for (const def of ALL_TABLES) {
      for (const scope of await (await collectionOf(def)).distinct('_scope', { _dirty: true })) pairs.push({ def, scope });
    }
    const contexts = new Map<string, DisplayContext>();

    for (const [i, { def, scope }] of pairs.entries()) {
      if (i >= maxTables || Date.now() - started > timeBudgetMs) {
        result.remaining = pairs.length - i;
        break;
      }
      try {
        const sheetId = await mirrorSheetId(scope);
        if (!sheetId) throw new Error('找不到同步目的地試算表');
        const col = await collectionOf(def);
        const docs = await col.find({ _scope: scope }).sort({ _ord: 1 }).toArray();
        const ctx = contexts.get(scope) ?? new DisplayContext(scope);
        contexts.set(scope, ctx);
        const rows = await writeTable(def, sheetId, docs, ctx);
        const dirty = docs.filter((d) => d._dirty);
        if (dirty.length > 0) {
          await col.bulkWrite(dirty.map((d) => ({ updateOne: { filter: { _id: d._id, _ver: d._ver }, update: { $set: { _dirty: false } } } })));
        }
        await recordState(def, scope, true);
        result.tables.push({ table: def.key, scope, rows });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await recordState(def, scope, false, msg);
        result.tables.push({ table: def.key, scope, error: msg });
      }
    }
    return result;
  } finally {
    await releaseLock();
  }
}

/** 把指定範圍全部標成待同步（重新產生 Sheet） */
export async function resetSync(tableKey?: string, scope?: string): Promise<number> {
  let n = 0;
  for (const def of ALL_TABLES) {
    if (tableKey && def.key !== tableKey) continue;
    const res = await (await collectionOf(def)).updateMany(scope ? { _scope: scope } : {}, { $set: { _dirty: true } });
    n += res.modifiedCount;
  }
  return n;
}

export interface SyncStatusRow {
  table: string;
  tab: string;
  scope: string;
  pending: number;
  lastSuccessAt?: Date;
  lastError?: string;
  failures?: number;
}

export async function syncStatus(): Promise<{ rows: SyncStatusRow[]; conflicts: SheetConflict[] }> {
  const db = await getDb();
  const states = await db.collection<{ _id: string; table: string; scope: string; lastSuccessAt?: Date; lastError?: string; failures?: number }>('_sync_state').find().toArray();
  const map = new Map<string, SyncStatusRow>();
  for (const s of states) {
    map.set(s._id, { table: s.table, tab: defByKey.get(s.table)?.tab ?? s.table, scope: s.scope, pending: 0, lastSuccessAt: s.lastSuccessAt, lastError: s.lastError, failures: s.failures });
  }
  for (const def of ALL_TABLES) {
    const counts = await (await collectionOf(def)).aggregate<{ _id: string; n: number }>([{ $match: { _dirty: true } }, { $group: { _id: '$_scope', n: { $sum: 1 } } }]).toArray();
    for (const c of counts) {
      const key = `${def.key}:${c._id}`;
      const row = map.get(key) ?? { table: def.key, tab: def.tab, scope: c._id, pending: 0 };
      row.pending = c.n;
      map.set(key, row);
    }
  }
  const conflicts = await db.collection<SheetConflict>('_sync_conflicts').find({ resolved: { $ne: true } }).sort({ at: -1 }).limit(50).toArray();
  return { rows: [...map.values()].sort((a, b) => a.scope.localeCompare(b.scope) || a.tab.localeCompare(b.tab)), conflicts };
}

export interface SheetConflict {
  _id: string;
  at: Date;
  scope: string;
  tab: string;
  id: string;
  header: string;
  sheetOld: string;
  sheetNew: string;
  dbValue: string;
  editor: string;
  resolved?: boolean;
}

export async function resolveConflict(id: string): Promise<void> {
  await (await getDb()).collection<SheetConflict>('_sync_conflicts').updateOne({ _id: id }, { $set: { resolved: true } });
}

export interface SheetEdit {
  spreadsheetId: string;
  tab: string;
  id: string;
  header: string;
  oldValue?: string;
  newValue?: string;
  editor?: string;
}

export type SheetEditResult = { status: 'applied' } | { status: 'conflict' | 'rejected'; reason: string };

async function scopeOfSheet(spreadsheetId: string): Promise<string | null> {
  if (spreadsheetId === (await getMasterSheetId())) return 'master';
  const events = await (await collectionOf(EventTable)).find({ _scope: 'master', _deleted: false }).toArray();
  const ev = events.find((e) => extractSheetIdFromUrl(String(e['活動試算表'] ?? '')) === spreadsheetId);
  return ev ? String(ev['活動ID']) : null;
}

/** 從 Sheet 寫回一格。資料庫目前值與 Sheet 修改前的值不同時視為衝突，不寫入（下一輪推送會把 Sheet 改回來） */
export async function applySheetEdit(edit: SheetEdit): Promise<SheetEditResult> {
  if (await isSheetSyncPaused()) return { status: 'rejected', reason: 'Google Sheet 同步已暫停，修改不會寫回系統' };
  const def = defByTab.get(edit.tab);
  if (!def) return { status: 'rejected', reason: `不支援的分頁「${edit.tab}」` };
  if (!(def.sheetEditable ?? []).includes(edit.header)) return { status: 'rejected', reason: `「${edit.header}」不可在 Sheet 上修改` };
  const scope = await scopeOfSheet(edit.spreadsheetId);
  if (!scope) return { status: 'rejected', reason: '找不到對應的活動' };

  const col = await collectionOf(def);
  const doc = await col.findOne({ _id: docId(scope, edit.id), _deleted: false });
  if (!doc) return { status: 'rejected', reason: `找不到 ${def.idColumn} ${edit.id}` };
  const row = normalizeRow(def, doc) as Row;
  const ctx = new DisplayContext(scope);
  const isDisplay = (def.displayColumns ?? []).includes(edit.header);
  const dbValue = isDisplay ? await ctx.value(def, edit.header, row) : row[edit.header] ?? '';
  const oldValue = edit.oldValue ?? '';
  const newValue = (edit.newValue ?? '').trim();
  const editor = edit.editor || 'sheet';

  if (dbValue !== oldValue) {
    await (await getDb()).collection<SheetConflict>('_sync_conflicts').insertOne({
      _id: newId('日誌ID'), at: new Date(), scope, tab: def.tab, id: edit.id, header: edit.header,
      sheetOld: oldValue, sheetNew: newValue, dbValue, editor,
    });
    await col.updateOne({ _id: doc._id }, { $set: { _dirty: true } });
    return { status: 'conflict', reason: `系統中的值已是「${dbValue}」` };
  }

  let changes: Row = { [edit.header]: newValue };
  if (def.key === GroupMemberTable.key && edit.header === '分組名稱') {
    const group = await (await collectionOf(GroupTable)).findOne({ _scope: scope, _deleted: false, 類型: row['類型'], 名稱: newValue });
    if (!group) return { status: 'rejected', reason: `找不到${row['類型']}「${newValue}」` };
    changes = { 分組ID: String(group['分組ID']) };
  }
  if ('更新時間' in row) changes['更新時間'] = nowString();

  try {
    await new SheetTable(scope, def, 'admin').updateByIds([{ id: edit.id, changes }]);
  } catch (e) {
    return { status: 'rejected', reason: e instanceof Error ? e.message : String(e) };
  }
  if (scope !== 'master') {
    await new SheetTable(scope, LogTable, 'admin').append([
      { 日誌ID: newId('日誌ID'), 時間: nowString(), 系統: 'sheet', 操作者: editor, 動作: 'Sheet 修改', 對象ID: edit.id, 內容: `${def.tab}.${edit.header}：${oldValue} → ${newValue}` },
    ]);
  }
  return { status: 'applied' };
}

/** Apps Script 需要安裝觸發的試算表 */
export async function syncTargets(): Promise<{ master: string; events: { eventId: string; spreadsheetId: string }[] }> {
  // 暫停同步時不回傳任何試算表，Apps Script 就不會處理
  if (await isSheetSyncPaused()) return { master: '', events: [] };
  const events = await (await collectionOf(EventTable)).find({ _scope: 'master', _deleted: false, 狀態: { $nin: ['已結束', '已封存'] } }).toArray();
  return {
    master: await getMasterSheetId(),
    events: events
      .map((e) => ({ eventId: String(e['活動ID']), spreadsheetId: extractSheetIdFromUrl(String(e['活動試算表'] ?? '')) }))
      .filter((e) => e.spreadsheetId),
  };
}

/** Apps Script 用：各分頁可寫回的欄位與主鍵 */
export function editableColumns(): { tab: string; idColumn: string; editable: string[] }[] {
  return ALL_TABLES.map((d) => ({ tab: d.tab, idColumn: d.idColumn, editable: [...((d as TableDef).sheetEditable ?? [])] }));
}
