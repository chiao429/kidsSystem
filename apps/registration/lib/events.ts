import 'server-only';
import { EventStatus, parseRules, type EventTable, type RowOf } from '@kids/schema';
import { extractSheetIdFromUrl } from '@kids/sheets-core';
import { events } from './tables';

export type EventRow = RowOf<typeof EventTable>;

/** Sheet 上的時間以台北時間 "YYYY-MM-DDTHH:mm" 儲存 */
export function parseTaipei(v: string): Date | null {
  if (!v) return null;
  const iso = v.length === 10 ? `${v}T00:00:00+08:00` : v.length === 16 ? `${v}:00+08:00` : v;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function registrationWindow(e: EventRow, now = new Date()): { open: boolean; reason?: string } {
  if (e.狀態 !== EventStatus.Open) return { open: false, reason: `目前狀態：${e.狀態 || '未開放'}` };
  const start = parseTaipei(e.報名開放);
  const end = parseTaipei(e.報名截止);
  if (start && now < start) return { open: false, reason: `報名將於 ${e.報名開放.replace('T', ' ')} 開放` };
  if (end && now > end) return { open: false, reason: '報名已截止' };
  return { open: true };
}

export async function listOpenEvents() {
  const rows = await events().all();
  return rows.filter((e) => e.狀態 === EventStatus.Open);
}

export async function getEvent(eventId: string) {
  const row = await events().findById(eventId);
  if (!row) return null;
  return { ...row, sheetId: extractSheetIdFromUrl(row.活動試算表), rules: parseRules(row.報名規則) };
}

export type EventInfo = NonNullable<Awaited<ReturnType<typeof getEvent>>>;
