import { cached, invalidate } from './cache';
import { getDb } from './mongo';

/**
 * 系統設定（存在 MongoDB 的 settings 集合）。
 * 主資料試算表 ID 可以在後台「初始化」頁綁定，沒有綁定時沿用環境變數 GOOGLE_MASTER_SHEET_ID；
 * 純 Google Sheets 模式（主資料就在試算表裡）只能用環境變數。
 */
interface SettingDoc {
  _id: string;
  value: string;
  updatedAt: Date;
  updatedBy: string;
}

const KEY = 'masterSheetId';
const envMasterSheetId = () => process.env.GOOGLE_MASTER_SHEET_ID ?? '';
const isMongo = () => process.env.DATA_BACKEND === 'mongo';

async function settings() {
  return (await getDb()).collection<SettingDoc>('settings');
}

export interface MasterSheetSetting {
  id: string;
  /** db：後台綁定；env：環境變數；none：都沒有 */
  source: 'db' | 'env' | 'none';
  updatedAt?: Date;
  updatedBy?: string;
}

export async function masterSheetSetting(): Promise<MasterSheetSetting> {
  if (!isMongo()) return envMasterSheetId() ? { id: envMasterSheetId(), source: 'env' } : { id: '', source: 'none' };
  return cached(`setting:${KEY}`, 30_000, async () => {
    const doc = await (await settings()).findOne({ _id: KEY });
    if (doc?.value) return { id: doc.value, source: 'db' as const, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy };
    return envMasterSheetId() ? { id: envMasterSheetId(), source: 'env' as const } : { id: '', source: 'none' as const };
  });
}

/** 主資料試算表 ID（鏡像、同步、初始化都用這個） */
export async function getMasterSheetId(): Promise<string> {
  return (await masterSheetSetting()).id;
}

/** 綁定主資料試算表；傳空字串＝解除綁定（改回環境變數） */
export async function setMasterSheetId(id: string, updatedBy: string): Promise<void> {
  if (!isMongo()) throw new Error('只有 MongoDB 模式可以在畫面上綁定主資料試算表');
  const col = await settings();
  if (id) await col.updateOne({ _id: KEY }, { $set: { value: id, updatedAt: new Date(), updatedBy } }, { upsert: true });
  else await col.deleteOne({ _id: KEY });
  invalidate(`setting:${KEY}`);
}
