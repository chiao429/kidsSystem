import 'server-only';
import {
  CheckInStatus, ENROLLED_ROLES, baseOf, GroupRole, GroupType, LEARNER_ROLES, RegistrationStatus, courseLabel, gradeRank, groupsOfType, hasGroupType, nowString,
} from '@kids/schema';
import { getEvent } from './events';
import { checkIns, groupMembers, groups, households, members, registrations, schedules } from './tables';
import type { Board, BoardRow, GroupInfo, SlotInfo } from './types';

/** 報到紀錄的鍵：同一報名在「一般報到」（分組ID 空白）與各課程各有一列 */
export const checkInKey = (報名ID: string, 分組ID: string) => `${報名ID}|${分組ID}`;

/** 此活動啟用的分組（依類型與排序） */
export async function loadGroups(eventId: string): Promise<{ groupTypes: GroupType[]; groups: GroupInfo[] }> {
  const event = await getEvent(eventId);
  const gg = await groups(event.活動ID).all();
  const groupTypes = (event.rules.groupTypes ?? [GroupType.Team]).filter((t) => hasGroupType(event.rules, t));
  const list = groupTypes.flatMap((t) => groupsOfType(gg, t));
  return { groupTypes, groups: list.map((g) => ({ 分組ID: g.分組ID, 類型: g.類型 as GroupType, 名稱: g.名稱, 區域: g.區域, 說明: g.說明 })) };
}

/** 報到看板；course 為課程分組ID，空白為一般報到 */
export async function loadBoard(eventId: string, course = ''): Promise<Board> {
  const event = await getEvent(eventId);
  const [regs, mm, hh, gm, cc, info, gg] = await Promise.all([
    registrations(event.活動ID).all(),
    members().all(),
    households().all(),
    groupMembers(event.活動ID).all(),
    checkIns(event.活動ID).all(),
    loadGroups(eventId),
    groups(event.活動ID).all(),
  ]);
  const feeById = new Map(gg.map((g) => [g.分組ID, Number(g.材料費) || 0]));
  const memberById = new Map(mm.map((m) => [m.成員ID, m]));
  const householdById = new Map(hh.map((h) => [h.家庭ID, h]));
  const groupById = new Map(info.groups.map((g) => [g.分組ID, g]));
  const learners = gm.filter((m) => LEARNER_ROLES.includes(m.角色) && groupById.has(m.分組ID));
  const teamByMember = new Map(learners.filter((m) => m.類型 === GroupType.Team).map((m) => [m.成員ID, groupById.get(m.分組ID)!]));
  // 課程含備取（名稱後加「（備取）」，不收費）
  const coursesByReg = new Map<string, { 分組ID: string; 名稱: string; 備取: boolean }[]>();
  for (const m of gm.filter((x) => x.類型 === GroupType.Course && ENROLLED_ROLES.includes(x.角色) && groupById.has(x.分組ID))) {
    const key = m.報名ID || m.成員ID;
    coursesByReg.set(key, [
      ...(coursesByReg.get(key) ?? []),
      { 分組ID: m.分組ID, 名稱: courseLabel(groupById.get(m.分組ID)!.名稱, m.角色), 備取: m.角色 === GroupRole.Waitlist },
    ]);
  }
  const checkInByKey = new Map(cc.map((c) => [checkInKey(c.報名ID, c.分組ID), c]));

  const rows: BoardRow[] = regs
    .filter((r) => r.狀態 !== RegistrationStatus.Cancelled)
    .map((r) => ({ r, courses: coursesByReg.get(r.報名ID) ?? coursesByReg.get(r.成員ID) ?? [] }))
    .filter(({ courses }) => !course || courses.some((c) => c.分組ID === course))
    .map(({ r, courses }) => {
      const m = memberById.get(r.成員ID);
      const h = householdById.get(r.家庭ID);
      const t = teamByMember.get(r.成員ID);
      const c = checkInByKey.get(checkInKey(r.報名ID, course));
      return {
        報名ID: r.報名ID,
        序號: r.序號,
        成員ID: r.成員ID,
        家庭ID: r.家庭ID,
        姓名: r.姓名,
        性別: m?.性別 ?? '',
        年級: m?.年級 || r.年級,
        小隊ID: t?.分組ID ?? '',
        小隊: t?.名稱 ?? '',
        區域: t?.區域 ?? '',
        報名狀態: r.狀態,
        報名類型: r.報名類型,
        課程: courses.map(({ 分組ID, 名稱 }) => ({ 分組ID, 名稱 })),
        家長: h?.主要聯絡人 ?? '',
        電話: h?.電話 ?? '',
        特殊需求: m?.特殊需求 ?? '',
        報到狀態: c?.狀態 ?? '',
        報到時間: c?.狀態 === CheckInStatus.Arrived ? c.報到時間 : '',
        晚到: c?.晚到 === 'Y',
        已聯繫: c?.已聯繫 === 'Y',
        繳費狀態: r.繳費狀態 ?? '',
        繳費金額: r.繳費金額 ?? '',
        基地: baseOf(m?.年級 || r.年級),
        應繳: courses.filter((x) => !x.備取).reduce((sum, x) => sum + (feeById.get(x.分組ID) ?? 0), 0),
      };
    })
    .sort((a, b) => (Number(a.序號) || 1e9) - (Number(b.序號) || 1e9) || gradeRank(a.年級) - gradeRank(b.年級));

  return {
    eventName: event.名稱,
    groupTypes: info.groupTypes,
    groups: info.groups,
    course,
    rows,
    updatedAt: nowString(),
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** 各分組目前/下一個時段（依台北時間） */
export async function loadSlots(eventId: string, now = new Date()): Promise<SlotInfo[]> {
  const event = await getEvent(eventId);
  const [slots, info] = await Promise.all([schedules(event.活動ID).all(), loadGroups(eventId)]);
  const today = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
  const nowMin = toMinutes(now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit' }));

  return info.groups.map((g) => {
    const mine = slots
      .filter((s) => (s.分組ID === g.分組ID || (!s.分組ID && (!s.分組類型 || s.分組類型 === g.類型))) && (!s.日期 || s.日期 === today))
      .sort((a, b) => toMinutes(a.開始) - toMinutes(b.開始));
    const fmt = (s: (typeof mine)[number]) => ({ 時間: `${s.開始}-${s.結束}`, 地點: s.地點, 內容: s.內容 });
    const current = mine.find((s) => toMinutes(s.開始) <= nowMin && nowMin < toMinutes(s.結束));
    const next = mine.find((s) => toMinutes(s.開始) > nowMin);
    return { 分組ID: g.分組ID, 類型: g.類型, 名稱: g.名稱, 區域: g.區域 || g.說明, current: current && fmt(current), next: next && fmt(next) };
  });
}
