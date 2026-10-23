'use server';

import { requireSession } from '@kids/auth/next';
import { AttendanceStatus, newId, nowString } from '@kids/schema';
import { assertGroup, getEvent, loadGroups, loadRoll, type RollMember } from './data';
import { attendance, logs } from './tables';

const STATUSES = Object.values(AttendanceStatus) as string[];

async function allowedGroup(eventId: string, 分組ID: string) {
  const session = requireSession({ permission: 'rollcall', eventId });
  const event = await getEvent(eventId);
  const { allowed } = await loadGroups(event.活動ID, session, event.rules);
  assertGroup(allowed, 分組ID);
  return { session, event, group: allowed.find((g) => g.分組ID === 分組ID)! };
}

export async function fetchRoll(eventId: string, team: string, slotId: string): Promise<RollMember[]> {
  const { event, group } = await allowedGroup(eventId, team);
  return loadRoll(event.活動ID, group, slotId);
}

/** 整批儲存一個分組在一個時段的點名結果（依 時段ID＋分組ID＋成員ID 新增或更新） */
export async function saveRoll(
  eventId: string,
  team: string,
  slotId: string,
  entries: { 成員ID: string; 姓名: string; 狀態: string; 備註: string }[],
): Promise<{ error?: string; saved?: number }> {
  const { session, event, group } = await allowedGroup(eventId, team);
  const valid = entries.filter((e) => STATUSES.includes(e.狀態));
  if (valid.length === 0) return { error: '沒有要儲存的點名結果' };

  const table = attendance(event.活動ID);
  const existing = await table.all({ fresh: true });
  const now = nowString();
  const changed = valid.filter((e) => {
    const row = existing.find((a) => a.時段ID === slotId && a.分組ID === group.分組ID && a.成員ID === e.成員ID);
    return !row || row.狀態 !== e.狀態 || row.備註 !== e.備註.slice(0, 100);
  });
  await table.upsertManyByKey(
    ['時段ID', '分組ID', '成員ID'],
    changed.map((e) => ({
      點名ID: newId('點名ID'),
      時段ID: slotId,
      分組ID: group.分組ID,
      成員ID: e.成員ID,
      姓名: e.姓名,
      狀態: e.狀態,
      備註: e.備註.slice(0, 100),
      操作者: session.name,
      時間: now,
    })),
  );
  try {
    await logs(event.活動ID).append([
      { 日誌ID: newId('日誌ID'), 時間: now, 系統: 'rollcall', 操作者: session.name, 動作: '點名', 對象ID: `${group.名稱}/${slotId}`, 內容: `${valid.length} 人` },
    ]);
  } catch (e) {
    console.error('寫入日誌失敗', e);
  }
  return { saved: changed.length };
}
