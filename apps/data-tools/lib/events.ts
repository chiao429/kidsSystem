import 'server-only';
import { canAccessEvent, type Session } from '@kids/auth';
import { extractSheetIdFromUrl } from '@kids/sheets-core';
import { events } from './tables';

export async function listEvents(session: Session) {
  return (await events().all()).filter((e) => canAccessEvent(session, e.活動ID));
}

export async function getEvent(eventId: string) {
  const row = await events().findById(eventId);
  if (!row) throw new Error(`找不到活動 ${eventId}`);
  return { ...row, sheetId: extractSheetIdFromUrl(row.活動試算表) };
}
