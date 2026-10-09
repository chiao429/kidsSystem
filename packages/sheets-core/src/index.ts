export { getSheetsClient, extractSheetIdFromUrl } from './client';
export { cached, invalidate } from './cache';
export { SheetTable } from './table';

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
