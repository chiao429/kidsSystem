import 'server-only';
import { CheckInStatus, RegistrationStatus, gradeRank, nowString, splitList } from '@kids/schema';
import { getEvent } from './events';
import { checkIns, households, members, registrations, schedules, teams } from './tables';
import type { Board, BoardRow, SlotInfo } from './types';

/** 報到紀錄的鍵：同一報名在「一般報到」與各課程各有一列 */
export const checkInKey = (報名ID: string, 課程: string) => `${報名ID}|${課程}`;

export async function loadBoard(eventId: string, course = ''): Promise<Board> {
  const event = await getEvent(eventId);
  const [regs, mm, hh, tt, cc] = await Promise.all([
    registrations(event.sheetId).all(),
    members().all(),
    households().all(),
    teams(event.sheetId).all(),
    checkIns(event.sheetId).all(),
  ]);
  const memberById = new Map(mm.map((m) => [m.成員ID, m]));
  const householdById = new Map(hh.map((h) => [h.家庭ID, h]));
  const teamByMember = new Map(tt.filter((t) => t.角色 === '隊員').map((t) => [t.成員ID, t]));
  const checkInByKey = new Map(cc.map((c) => [checkInKey(c.報名ID, c.課程), c]));

  const rows: BoardRow[] = regs
    .filter((r) => r.狀態 !== RegistrationStatus.Cancelled)
    .filter((r) => !course || splitList(r.課程).includes(course))
    .map((r) => {
      const m = memberById.get(r.成員ID);
      const h = householdById.get(r.家庭ID);
      const t = teamByMember.get(r.成員ID);
      const c = checkInByKey.get(checkInKey(r.報名ID, course));
      return {
        報名ID: r.報名ID,
        序號: r.序號,
        成員ID: r.成員ID,
        姓名: r.姓名,
        性別: m?.性別 ?? '',
        年級: m?.年級 || r.年級,
        小隊: t?.小隊 ?? '',
        區域: t?.區域 ?? '',
        報名狀態: r.狀態,
        報名類型: r.報名類型,
        課程: splitList(r.課程),
        家長: h?.主要聯絡人 ?? '',
        電話: h?.電話 ?? '',
        特殊需求: m?.特殊需求 ?? '',
        報到狀態: c?.狀態 ?? '',
        報到時間: c?.狀態 === CheckInStatus.Arrived ? c.報到時間 : '',
        晚到: c?.晚到 === 'Y',
        已聯繫: c?.已聯繫 === 'Y',
      };
    })
    .sort((a, b) => (Number(a.序號) || 1e9) - (Number(b.序號) || 1e9) || gradeRank(a.年級) - gradeRank(b.年級));

  return {
    eventName: event.名稱,
    courses: (event.rules.courses ?? []).map((c) => c.name),
    course,
    rows,
    updatedAt: nowString(),
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** 各小隊目前/下一個時段（依台北時間） */
export async function loadSlots(eventId: string, now = new Date()): Promise<SlotInfo[]> {
  const event = await getEvent(eventId);
  const [slots, tt] = await Promise.all([schedules(event.sheetId).all(), teams(event.sheetId).all()]);
  const today = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  const nowMin = toMinutes(now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }));
  const teamNames = Array.from(new Set(tt.map((t) => t.小隊))).sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
  const areaOf = new Map(tt.map((t) => [t.小隊, t.區域]));

  return teamNames.map((小隊) => {
    const mine = slots
      .filter((s) => (s.小隊 === 小隊 || s.小隊 === '全部') && (!s.日期 || s.日期 === today))
      .sort((a, b) => toMinutes(a.開始) - toMinutes(b.開始));
    const fmt = (s: (typeof mine)[number]) => ({ 時間: `${s.開始}-${s.結束}`, 地點: s.地點, 內容: s.內容 });
    const current = mine.find((s) => toMinutes(s.開始) <= nowMin && nowMin < toMinutes(s.結束));
    const next = mine.find((s) => toMinutes(s.開始) > nowMin);
    return { 小隊, 區域: areaOf.get(小隊) ?? '', current: current && fmt(current), next: next && fmt(next) };
  });
}
