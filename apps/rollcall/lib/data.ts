import 'server-only';
import { canAccessEvent, type Session } from '@kids/auth';
import {
  CheckInStatus, GROUP_TYPES, GroupType, RegistrationStatus, groupsOfType, hasGroupType, leaderGroupIds, membersOfGroup,
  parseRules, splitList,
} from '@kids/schema';
import type { EventRules } from '@kids/schema';
import { extractSheetIdFromUrl } from '@kids/sheets-core';
import { attendance, checkIns, events, groupMembers, groups, registrations, schedules } from './tables';

export async function listEvents(session: Session) {
  return (await events().all()).filter((e) => canAccessEvent(session, e.活動ID) && e.狀態 !== '已結束');
}

export async function getEvent(eventId: string) {
  const row = await events().findById(eventId);
  if (!row) throw new Error(`找不到活動 ${eventId}`);
  const rules = parseRules(row.報名規則);
  return { ...row, sheetId: extractSheetIdFromUrl(row.活動試算表), rules };
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

export interface GroupRef {
  分組ID: string;
  類型: GroupType;
  名稱: string;
}

/**
 * 可點名的分組：
 * - mine：在分組成員擔任負責人（非隊員/學員），或「帳號．小隊」以名稱比對到的分組（舊資料相容）
 * - allowed：staff 只能點自己負責的；admin/manager 可點全部
 */
export async function loadGroups(eventId: string, session: Session, rules: EventRules = {}) {
  const [gg, gm] = await Promise.all([groups(eventId).all(), groupMembers(eventId).all()]);
  const types = GROUP_TYPES.filter((t) => hasGroupType(rules, t));
  const all: GroupRef[] = types.flatMap((t) => groupsOfType(gg, t)).map((g) => ({ 分組ID: g.分組ID, 類型: g.類型 as GroupType, 名稱: g.名稱 }));
  const legacy = splitList(session.team);
  const mineIds = new Set([...leaderGroupIds(gm, session.account), ...all.filter((g) => legacy.includes(g.名稱)).map((g) => g.分組ID)]);
  const mine = all.filter((g) => mineIds.has(g.分組ID));
  const allowed = session.scope === 'own' ? mine : all;
  return { all, mine, allowed, byId: new Map(all.map((g) => [g.分組ID, g])) };
}

export function assertGroup(allowed: GroupRef[], 分組ID: string) {
  if (!allowed.some((g) => g.分組ID === 分組ID)) throw new Error('沒有此分組的點名權限');
}

export async function loadSlots(eventId: string, group: GroupRef): Promise<Slot[]> {
  const rows = (await schedules(eventId).all())
    .filter((s) => s.分組ID === group.分組ID || (!s.分組ID && (!s.分組類型 || s.分組類型 === group.類型)))
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

/** 分組的點名名單：隊員/學員；小隊看一般報到，課程看該課程的報到 */
export async function loadRoll(eventId: string, group: GroupRef, slotId: string): Promise<RollMember[]> {
  const [gm, regs, cc, aa] = await Promise.all([
    groupMembers(eventId).all(),
    registrations(eventId).all(),
    checkIns(eventId).all(),
    attendance(eventId).all({ fresh: true }),
  ]);
  const regById = new Map(regs.map((r) => [r.報名ID, r]));
  const regByMember = new Map(regs.filter((r) => r.狀態 !== RegistrationStatus.Cancelled).map((r) => [r.成員ID, r]));
  const checkInGroup = group.類型 === GroupType.Course ? group.分組ID : '';
  return membersOfGroup(gm, group.分組ID)
    .map((m) => ({ m, reg: (m.報名ID && regById.get(m.報名ID)) || regByMember.get(m.成員ID) }))
    .filter(({ reg }) => !reg || reg.狀態 !== RegistrationStatus.Cancelled)
    .map(({ m, reg }) => {
      const c = cc.find((x) => x.分組ID === checkInGroup && (reg ? x.報名ID === reg.報名ID : x.成員ID === m.成員ID));
      const a = aa.find((x) => x.時段ID === slotId && x.分組ID === group.分組ID && x.成員ID === m.成員ID);
      return {
        成員ID: m.成員ID,
        姓名: reg?.姓名 ?? m.成員ID,
        checkedIn: c?.狀態 === CheckInStatus.Arrived,
        absentNotice: c?.狀態 === CheckInStatus.Absent,
        狀態: a?.狀態 ?? '',
        備註: a?.備註 ?? '',
      };
    })
    .sort((x, y) => x.姓名.localeCompare(y.姓名, 'zh-Hant'));
}
