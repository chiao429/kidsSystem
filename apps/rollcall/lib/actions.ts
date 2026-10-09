'use server';

import { requireSession } from '@kids/auth/next';
import { AttendanceStatus, newId, nowString } from '@kids/schema';
import { assertTeam, getEvent, loadRoll, loadTeams, type RollMember } from './data';
import { attendance, logs } from './tables';

const STATUSES = Object.values(AttendanceStatus) as string[];

export async function fetchRoll(eventId: string, team: string, slotId: string): Promise<RollMember[]> {
  const session = requireSession({ roles: ['admin', 'manager', 'staff'], eventId });
  const event = await getEvent(eventId);
  assertTeam((await loadTeams(event.sheetId, session)).allowed, team);
  return loadRoll(event.sheetId, team, slotId);
}

/** 整批儲存一個小隊在一個時段的點名結果（依 時段ID＋成員ID 新增或更新） */
export async function saveRoll(
  eventId: string,
  team: string,
  slotId: string,
  entries: { 成員ID: string; 姓名: string; 狀態: string; 備註: string }[],
): Promise<{ error?: string; saved?: number }> {
  const session = requireSession({ roles: ['admin', 'manager', 'staff'], eventId });
  const event = await getEvent(eventId);
  assertTeam((await loadTeams(event.sheetId, session)).allowed, team);
  const valid = entries.filter((e) => STATUSES.includes(e.狀態));
  if (valid.length === 0) return { error: '沒有要儲存的點名結果' };

  const table = attendance(event.sheetId);
  const existing = await table.all({ fresh: true });
  const now = nowString();
  const updates: { id: string; changes: Record<string, string> }[] = [];
  const creates: Record<string, string>[] = [];
  for (const e of valid) {
    const row = existing.find((a) => a.時段ID === slotId && a.成員ID === e.成員ID);
    const data = { 狀態: e.狀態, 備註: e.備註.slice(0, 100), 操作者: session.name, 時間: now };
    if (row) {
      if (row.狀態 !== e.狀態 || row.備註 !== data.備註) updates.push({ id: row.點名ID, changes: data });
    } else {
      creates.push({ 點名ID: newId('點名ID'), 時段ID: slotId, 小隊: team, 成員ID: e.成員ID, 姓名: e.姓名, ...data });
    }
  }
  await table.updateByIds(updates);
  await table.append(creates);
  try {
    await logs(event.sheetId).append([
      { 日誌ID: newId('日誌ID'), 時間: now, 系統: 'rollcall', 操作者: session.name, 動作: '點名', 對象ID: `${team}/${slotId}`, 內容: `${valid.length} 人` },
    ]);
  } catch (e) {
    console.error('寫入日誌失敗', e);
  }
  return { saved: updates.length + creates.length };
}
