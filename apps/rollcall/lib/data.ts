import 'server-only';
import { canAccessEvent, type Session } from '@kids/auth';
import { CheckInStatus, splitList } from '@kids/schema';
import { extractSheetIdFromUrl } from '@kids/sheets-core';
import { attendance, checkIns, events, schedules, teams } from './tables';

export async function listEvents(session: Session) {
  return (await events().all()).filter((e) => canAccessEvent(session, e.活動ID) && e.狀態 !== '已結束');
}

export async function getEvent(eventId: string) {
  const row = await events().findById(eventId);
  if (!row) throw new Error(`找不到活動 ${eventId}`);
  return { ...row, sheetId: extractSheetIdFromUrl(row.活動試算表) };
}

export const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

/** 沒有排時間表時，每天一個「整日點名」時段 */
export const dayslotId = (date: string) => `DAY-${date}`;

export interface Slot {
  時段ID: string;
  日期: string;
  時間: string;
  地點: string;
  內容: string;
}

export async function loadTeams(sheetId: string, session: Session) {
  const rows = await teams(sheetId).all();
  const all = Array.from(new Set(rows.map((r) => r.小隊))).sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
  // 自己帶的隊：帳號「小隊」欄，或在小隊分頁被設為小隊長（成員ID = 帳號）
  const mine = new Set([
    ...splitList(session.team),
    ...rows.filter((r) => r.角色 !== '隊員' && r.成員ID && r.成員ID === session.account).map((r) => r.小隊),
  ]);
  const allowed = session.role === 'staff' ? all.filter((t) => mine.has(t)) : all;
  return { all, mine: all.filter((t) => mine.has(t)), allowed };
}

export function assertTeam(allowed: string[], team: string) {
  if (!allowed.includes(team)) throw new Error('沒有此小隊的點名權限');
}

export async function loadSlots(sheetId: string, team: string): Promise<Slot[]> {
  const rows = (await schedules(sheetId).all())
    .filter((s) => s.小隊 === team || s.小隊 === '全部')
    .sort((a, b) => a.日期.localeCompare(b.日期) || a.開始.localeCompare(b.開始));
  const slots: Slot[] = rows.map((s) => ({ 時段ID: s.時段ID, 日期: s.日期, 時間: `${s.開始}-${s.結束}`, 地點: s.地點, 內容: s.內容 }));
  const d = today();
  if (!slots.some((s) => s.日期 === d)) slots.push({ 時段ID: dayslotId(d), 日期: d, 時間: '整日', 地點: '', 內容: '今日點名' });
  return slots;
}

export interface RollMember {
  成員ID: string;
  姓名: string;
  checkedIn: boolean;
  absentNotice: boolean;
  狀態: string;
  備註: string;
}

export async function loadRoll(sheetId: string, team: string, slotId: string): Promise<RollMember[]> {
  const [tt, cc, aa] = await Promise.all([teams(sheetId).all(), checkIns(sheetId).all(), attendance(sheetId).all({ fresh: true })]);
  const general = cc.filter((c) => !c.課程);
  return tt
    .filter((t) => t.小隊 === team && t.角色 === '隊員')
    .map((t) => {
      const c = general.find((x) => x.成員ID === t.成員ID);
      const a = aa.find((x) => x.時段ID === slotId && x.成員ID === t.成員ID);
      return {
        成員ID: t.成員ID,
        姓名: t.姓名,
        checkedIn: c?.狀態 === CheckInStatus.Arrived,
        absentNotice: c?.狀態 === CheckInStatus.Absent,
        狀態: a?.狀態 ?? '',
        備註: a?.備註 ?? '',
      };
    });
}
