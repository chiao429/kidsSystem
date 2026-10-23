import { MongoClient, MongoServerError, type AnyBulkWriteOperation, type Collection, type Db, type Document } from 'mongodb';
import type { RowOf, TableDef } from '@kids/schema';
import { keyOf, matchesFilter, normalizeRow, type RowFilter, type TableStore, type UpsertResult } from './store';

/**
 * 系統欄位：
 * - _id      `${_scope}:${主鍵}`
 * - _scope   'master' 或活動ID
 * - _ver     每次寫入 +1（同步用：推送後只清除版本未變的 _dirty）
 * - _dirty   待同步到 Sheet；與業務欄位在同一次寫入中設定
 * - _ord     建立順序（維持 Sheet 時代「依新增順序」的讀取行為）
 */
export interface StoredDoc extends Document {
  _id: string;
  _scope: string;
  _ver: number;
  _dirty: boolean;
  _deleted: boolean;
  _updatedAt: Date;
  _ord: number;
}

const g = globalThis as unknown as { __kidsMongo?: Promise<MongoClient> };

/** 重用連線：同一個 Node 程序（含 dev HMR）只建立一個 MongoClient */
export function getMongoClient(): Promise<MongoClient> {
  if (!g.__kidsMongo) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI 未設定');
    g.__kidsMongo = new MongoClient(uri, { maxPoolSize: 10 }).connect().catch((e) => {
      g.__kidsMongo = undefined;
      throw e;
    });
  }
  return g.__kidsMongo;
}

export async function getDb(): Promise<Db> {
  return (await getMongoClient()).db(process.env.MONGODB_DB || 'kids');
}

export async function collectionOf(def: TableDef): Promise<Collection<StoredDoc>> {
  return (await getDb()).collection<StoredDoc>(def.key);
}

export const docId = (scope: string, id: string) => `${scope}:${id}`;

let ordSeq = 0;
const nextOrd = () => Date.now() * 1000 + (ordSeq = (ordSeq + 1) % 1000);

function dupKeyMessage(def: TableDef, e: unknown): Error {
  if (e instanceof MongoServerError && e.code === 11000) {
    return new Error(`「${def.tab}」資料重複：${JSON.stringify(e.keyValue ?? {})}`);
  }
  return e as Error;
}

const meta = () => ({ _dirty: true, _deleted: false, _updatedAt: new Date() });

export class MongoStore<T extends TableDef> implements TableStore<T> {
  constructor(
    readonly scope: string,
    readonly def: T,
  ) {}

  private col() {
    return collectionOf(this.def);
  }

  private idOf(row: Partial<RowOf<T>>): string {
    const id = String((row as Record<string, string | undefined>)[this.def.idColumn] ?? '').trim();
    if (!id) throw new Error(`「${this.def.tab}」新增的資料缺少 ${this.def.idColumn}`);
    return id;
  }

  /** 只保留 schema 欄位，值一律字串 */
  private fields(row: Partial<RowOf<T>>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if ((this.def.headers as readonly string[]).includes(k)) out[k] = v == null ? '' : String(v);
    }
    return out;
  }

  async all(): Promise<RowOf<T>[]> {
    const docs = await (await this.col()).find({ _scope: this.scope, _deleted: false }).sort({ _ord: 1 }).toArray();
    return docs.map((d) => normalizeRow(this.def, d));
  }

  /** 新增；同 ID 若為已刪除資料則復活，若仍存在則丟出重複錯誤 */
  private insertOps(rows: Partial<RowOf<T>>[]): AnyBulkWriteOperation<StoredDoc>[] {
    return rows.map((r) => {
      const full = normalizeRow(this.def, this.fields(r));
      return {
        replaceOne: {
          filter: { _id: docId(this.scope, this.idOf(r)), _deleted: true },
          replacement: { ...full, _scope: this.scope, _ver: 1, _ord: nextOrd(), ...meta() } as unknown as StoredDoc,
          upsert: true,
        },
      };
    });
  }

  async append(rows: Partial<RowOf<T>>[]): Promise<void> {
    if (rows.length === 0) return;
    try {
      await (await this.col()).bulkWrite(this.insertOps(rows), { ordered: true });
    } catch (e) {
      throw dupKeyMessage(this.def, e);
    }
  }

  async updateByIds(patches: { id: string; changes: Partial<RowOf<T>> }[]): Promise<{ notFound: string[] }> {
    if (patches.length === 0) return { notFound: [] };
    const col = await this.col();
    const ids = patches.map((p) => docId(this.scope, p.id));
    const found = new Set((await col.find({ _id: { $in: ids }, _deleted: false }, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
    const notFound = patches.filter((p) => !found.has(docId(this.scope, p.id))).map((p) => p.id);
    const ops: AnyBulkWriteOperation<StoredDoc>[] = patches
      .filter((p) => found.has(docId(this.scope, p.id)))
      .map((p) => {
        const set = this.fields(p.changes);
        delete set[this.def.idColumn];
        return {
          updateOne: {
            filter: { _id: docId(this.scope, p.id), _deleted: false },
            update: { $set: { ...set, ...meta() }, $inc: { _ver: 1 } },
          },
        };
      });
    if (ops.length > 0) {
      try {
        await col.bulkWrite(ops);
      } catch (e) {
        throw dupKeyMessage(this.def, e);
      }
    }
    return { notFound };
  }

  async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await (await this.col()).updateMany(
      { _id: { $in: ids.map((id) => docId(this.scope, id)) }, _deleted: false },
      { $set: { _deleted: true, _dirty: true, _updatedAt: new Date() }, $inc: { _ver: 1 } },
    );
  }

  /** 以 transaction 軟刪除符合條件的列，再寫入新列 */
  async replaceWhere(filter: RowFilter<T> | null, rows: Partial<RowOf<T>>[]): Promise<void> {
    const client = await getMongoClient();
    const col = await this.col();
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const existing = await col.find({ _scope: this.scope, _deleted: false }, { session }).toArray();
        const removeIds = existing.filter((d) => matchesFilter(normalizeRow(this.def, d), filter)).map((d) => d._id);
        if (removeIds.length > 0) {
          await col.updateMany(
            { _id: { $in: removeIds } },
            { $set: { _deleted: true, _dirty: true, _updatedAt: new Date() }, $inc: { _ver: 1 } },
            { session },
          );
        }
        if (rows.length > 0) await col.bulkWrite(this.insertOps(rows), { session, ordered: true });
      });
    } catch (e) {
      throw dupKeyMessage(this.def, e);
    } finally {
      await session.endSession();
    }
  }

  async upsertByKey(keyColumns: T['headers'][number][], row: Partial<RowOf<T>>, onUpdate?: Partial<RowOf<T>>): Promise<UpsertResult<T>> {
    const col = await this.col();
    const keyFilter = Object.fromEntries(keyColumns.map((k) => [k, String((row as Record<string, string>)[k] ?? '')]));
    for (let attempt = 0; attempt < 2; attempt++) {
      const beforeDoc = await col.findOne({ _scope: this.scope, _deleted: false, ...keyFilter });
      if (beforeDoc) {
        const set = this.fields(onUpdate ?? row);
        delete set[this.def.idColumn];
        const after = await col.findOneAndUpdate(
          { _id: beforeDoc._id, _deleted: false },
          { $set: { ...set, ...meta() }, $inc: { _ver: 1 } },
          { returnDocument: 'after' },
        );
        if (!after) continue;
        return { created: false, before: normalizeRow(this.def, beforeDoc), row: normalizeRow(this.def, after) };
      }
      try {
        await col.bulkWrite(this.insertOps([row]));
        return { created: true, row: normalizeRow(this.def, this.fields(row)) };
      } catch (e) {
        // 同時有另一台裝置新增了同一鍵：重讀後改為更新
        if (e instanceof MongoServerError && e.code === 11000 && attempt === 0) continue;
        throw dupKeyMessage(this.def, e);
      }
    }
    throw new Error(`「${this.def.tab}」寫入衝突，請重試（${keyOf(row as Record<string, string>, keyColumns)}）`);
  }

  async ensure(): Promise<void> {
    await ensureIndexes(this.def);
  }
}

export async function ensureIndexes(def: TableDef): Promise<void> {
  const col = await collectionOf(def);
  const partial = { partialFilterExpression: { _deleted: false } };
  await col.createIndex({ _scope: 1, [def.idColumn]: 1 }, { name: 'scope_id', unique: true, ...partial });
  await col.createIndex({ _scope: 1, _ord: 1 }, { name: 'scope_ord' });
  await col.createIndex({ _scope: 1, _dirty: 1 }, { name: 'scope_dirty' });
  for (const keys of def.uniqueKeys ?? []) {
    const spec = Object.fromEntries([['_scope', 1], ...keys.map((k) => [k, 1])]);
    await col.createIndex(spec, { name: `uniq_${keys.join('_')}`, unique: true, ...partial });
  }
}
