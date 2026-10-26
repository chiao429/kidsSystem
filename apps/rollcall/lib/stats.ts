import 'server-only';
import { BASES, RegistrationStatus, groupCounts } from '@kids/schema';
import { testScope, type GroupRef } from './data';
import { attendance, groupMembers, registrations, schedules } from './tables';

export interface SlotCol {
  時段ID: string;
  label: string;
}

export async function loadStats(eventId: string, allowed: GroupRef[]) {
  const [gm, regs, ss, allAttendance, test] = await Promise.all([
    groupMembers(eventId).all(),
    registrations(eventId).all(),
    schedules(eventId).all(),
    attendance(eventId).all(),
    testScope(eventId),
  ]);
  // 測試家庭不納入統計
  const aa = allAttendance.filter((a) => !test.memberIds.has(a.成員ID));
  const slotIds = Array.from(new Set(aa.map((a) => a.時段ID)));
  const slotById = new Map(ss.map((s) => [s.時段ID, s]));
  const cols: SlotCol[] = slotIds
    .map((id) => {
      const s = slotById.get(id);
      return {
        時段ID: id,
        sort: s ? `${s.日期} ${s.開始}` : `${id.replace('DAY-', '')} 99`,
        label: s ? `${s.日期.slice(5)} ${s.開始}${s.內容 ? ` ${s.內容}` : ''}` : `${id.replace('DAY-', '').slice(5)} 整日`,
      };
    })
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .map(({ 時段ID, label }) => ({ 時段ID, label }));

  const cancelled = new Set([...regs.filter((r) => r.狀態 === RegistrationStatus.Cancelled).map((r) => r.報名ID), ...test.regIds]);
  const sizes = groupCounts(gm, undefined, cancelled);
  const teamRows = allowed.map((g) => {
    const size = sizes.get(g.分組ID) ?? 0;
    const cells = cols.map((c) => {
      const list = aa.filter((a) => a.分組ID === g.分組ID && a.時段ID === c.時段ID);
      const present = list.filter((a) => a.狀態 === '出席' || a.狀態 === '遲到').length;
      return { present, recorded: list.length, absent: list.filter((a) => a.狀態 === '缺席').length };
    });
    return { team: g.分組ID, name: `${g.名稱}`, type: g.類型, base: g.基地, size, cells };
  });

  // 全部與各基地的合計
  const totalsOf = (list: GroupRef[]) => {
    const ids = new Set(list.map((g) => g.分組ID));
    const recorded = aa.filter((a) => ids.has(a.分組ID));
    const present = recorded.filter((a) => a.狀態 === '出席' || a.狀態 === '遲到').length;
    return { recorded: recorded.length, present, rate: recorded.length ? present / recorded.length : 0 };
  };
  const byBase = Object.fromEntries(BASES.map((b) => [b.short, totalsOf(allowed.filter((g) => g.基地 === b.short))]));
  return { cols, teamRows, totals: totalsOf(allowed), byBase };
}
