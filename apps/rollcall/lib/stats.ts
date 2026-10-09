import 'server-only';
import { attendance, schedules, teams } from './tables';

export interface SlotCol {
  時段ID: string;
  label: string;
}

export async function loadStats(sheetId: string, allowed: string[]) {
  const [tt, ss, aa] = await Promise.all([teams(sheetId).all(), schedules(sheetId).all(), attendance(sheetId).all()]);
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

  const teamRows = allowed.map((team) => {
    const size = tt.filter((t) => t.小隊 === team && t.角色 === '隊員').length;
    const cells = cols.map((c) => {
      const list = aa.filter((a) => a.小隊 === team && a.時段ID === c.時段ID);
      const present = list.filter((a) => a.狀態 === '出席' || a.狀態 === '遲到').length;
      return { present, recorded: list.length, absent: list.filter((a) => a.狀態 === '缺席').length };
    });
    return { team, size, cells };
  });

  const recorded = aa.filter((a) => allowed.includes(a.小隊));
  const present = recorded.filter((a) => a.狀態 === '出席' || a.狀態 === '遲到').length;
  return { cols, teamRows, totals: { recorded: recorded.length, present, rate: recorded.length ? present / recorded.length : 0 } };
}
