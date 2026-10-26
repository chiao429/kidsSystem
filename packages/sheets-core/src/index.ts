export { getSheetsClient, extractSheetIdFromUrl } from './client';
export { cached, invalidate } from './cache';
export { SheetTable, PermissionError, dataBackend, resolveSheetId } from './table';
export { getMasterSheetId, isSheetSyncPaused, sheetFeaturesVisible, masterSheetSetting, setMasterSheetId, setSheetSyncPaused, type MasterSheetSetting } from './settings';
export type { RowFilter, UpsertResult } from './store';

import { getBackend } from './backend';

/** 讀取任意分頁的原始值（第一列為標題），用於匯入舊資料 */
export async function readRawTab(spreadsheetId: string, tab: string): Promise<Record<string, string>[]> {
  const values = await getBackend().values(spreadsheetId, tab);
  const header = (values[0] ?? []).map((h) => String(h).trim());
  return values
    .slice(1)
    .filter((r) => r.some((v) => String(v ?? '').trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, String(r[i] ?? '').trim()])));
}

import type { TableDef } from '@kids/schema';
import { SheetsStore } from './sheets-store';

/** 直接在指定試算表建立分頁與標題列（不經資料庫；用於確認權限與鏡像目的地） */
export async function ensureSheetTabs(spreadsheetId: string, defs: readonly TableDef[]): Promise<void> {
  for (const def of defs) await new SheetsStore(async () => spreadsheetId, def).ensure();
}
