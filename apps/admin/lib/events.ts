import 'server-only';
import { parseRules, type RowOf, type EventTable } from '@kids/schema';
import { extractSheetIdFromUrl } from '@kids/sheets-core';
import { canAccessEvent, type Session } from '@kids/auth';
import { events } from './tables';

export type EventRow = RowOf<typeof EventTable>;

export async function listEvents(session: Session): Promise<EventRow[]> {
  const rows = await events().all();
  return rows.filter((e) => canAccessEvent(session, e.活動ID));
}

export async function getEvent(eventId: string) {
  const row = await events().findById(eventId);
  if (!row) throw new Error(`找不到活動 ${eventId}`);
  return { ...row, sheetId: extractSheetIdFromUrl(row.活動試算表), rules: parseRules(row.報名規則) };
}
