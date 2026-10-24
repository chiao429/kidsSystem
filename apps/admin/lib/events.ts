import 'server-only';
import { parseRules, type RowOf, type EventTable } from '@kids/schema';
import { dataBackend, extractSheetIdFromUrl } from '@kids/sheets-core';
import { canAccessEvent, type Session } from '@kids/auth';
import { events } from './tables';

export type EventRow = RowOf<typeof EventTable>;

/** 純 Google Sheets 模式活動資料存在試算表裡，必須有活動試算表；Mongo／本機 JSON 模式可不填 */
export const isSheetRequired = () => dataBackend() !== 'mongo' && !process.env.SHEETS_LOCAL_DIR;

export async function listEvents(session: Session): Promise<EventRow[]> {
  const rows = await events().all();
  return rows.filter((e) => canAccessEvent(session, e.活動ID));
}

export async function getEvent(eventId: string) {
  const row = await events().findById(eventId);
  if (!row) throw new Error(`找不到活動 ${eventId}`);
  return { ...row, sheetId: extractSheetIdFromUrl(row.活動試算表), rules: parseRules(row.報名規則) };
}
