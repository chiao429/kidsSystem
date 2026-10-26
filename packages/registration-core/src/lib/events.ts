import 'server-only';
import { EventStatus, isArchivedEvent, parseRules, type EventTable, type RowOf } from '@kids/schema';
import { extractSheetIdFromUrl } from '@kids/sheets-core';
import { events, signatures } from './tables';

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
  if (!row || isArchivedEvent(row)) return null;
  return { ...row, sheetId: extractSheetIdFromUrl(row.活動試算表), rules: parseRules(row.報名規則) };
}

export type EventInfo = NonNullable<Awaited<ReturnType<typeof getEvent>>>;

/** 活動實際顯示的簽名檔內容：指定的 → 預設的；「無」或沒有簽名檔時回傳空字串（簽名檔分頁還沒建立也不影響活動頁） */
export async function eventSignatureHtml(e: EventRow): Promise<string> {
  if (e.簽名檔 === '無') return '';
  try {
    const all = await signatures().all();
    return ((e.簽名檔 && all.find((s) => s.簽名檔ID === e.簽名檔)) || all.find((s) => s.預設 === 'Y'))?.內容 ?? '';
  } catch {
    return '';
  }
}

const WEEK = '日一二三四五六';

/** 課程分組卡片標題的日期「10/18(日)」：取自活動資訊的時間；還沒設定時用活動開始日期 */
export function eventDateLabel(e: EventRow): string {
  const fromTime = e.活動時間.match(/^\d{1,2}\/\d{1,2}\([日一二三四五六]\)/)?.[0];
  if (fromTime) return fromTime;
  const m = e.開始日期.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[2]}/${m[3]}(${WEEK[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()]})`;
}
