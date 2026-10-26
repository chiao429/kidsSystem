'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { AttendanceStatus, BASES, newId, nowString } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { attendanceOn, checkedInOn, getGroup, isDate, listGroups, rosterOn, today } from './data';
import { ensureSmallGroupTables, members, smallGroupAttendance, smallGroupMembers, smallGroups } from './tables';

const clean = (v: unknown, max = 500) => String(v ?? '').trim().slice(0, max);
const STATUSES: string[] = ['', ...Object.values(AttendanceStatus)];

/**
 * 當天有報到的組員自動點名「出席」（直接點名成功）；已經點過名的不覆蓋。
 * 回傳這次新帶入的人數。
 */
export async function syncCheckIns(小組ID: string, date: string): Promise<{ added: number }> {
  const session = requireSession({ permission: 'smallgroups' });
  if (!isDate(date)) return { added: 0 };
  const group = await getGroup(session, 小組ID);
  const [roster, records, arrived] = await Promise.all([rosterOn(group.小組ID, date), attendanceOn(group.小組ID, date), checkedInOn(date)]);
  const arrivedIds = new Set(arrived.map((k) => k.成員ID));
  const marked = new Set(records.filter((r) => r.狀態).map((r) => r.成員ID));
  const todo = roster.filter((m) => arrivedIds.has(m.成員ID) && !marked.has(m.成員ID));
  if (todo.length === 0) return { added: 0 };
  await ensureSmallGroupTables();
  const now = nowString();
  for (const m of todo) {
    await smallGroupAttendance().upsertByKey(
      ['小組ID', '成員ID', '日期'],
      { 小組點名ID: newId('小組點名ID'), 小組ID: group.小組ID, 成員ID: m.成員ID, 姓名: m.姓名, 日期: date, 狀態: AttendanceStatus.Present, 當天狀況: '', 備註: '', 操作者: '報到同步', 時間: now },
      { 狀態: AttendanceStatus.Present, 操作者: '報到同步', 時間: now },
    );
  }
  return { added: todo.length };
}

/** 點名：出席狀態、當天狀況、備註（只更新有傳的欄位） */
export async function saveAttendance(
  小組ID: string,
  成員ID: string,
  date: string,
  changes: { 狀態?: string; 當天狀況?: string; 備註?: string },
): Promise<{ error?: string }> {
  const session = requireSession({ permission: 'smallgroups' });
  if (!isDate(date)) return { error: '日期格式錯誤' };
  if (changes.狀態 != null && !STATUSES.includes(changes.狀態)) return { error: '無效的出席狀態' };
  const group = await getGroup(session, 小組ID);
  const member = (await rosterOn(group.小組ID, date)).find((m) => m.成員ID === 成員ID);
  if (!member) return { error: '這位孩子當天不在這個小組' };
  await ensureSmallGroupTables();
  const now = nowString();
  const set: Record<string, string> = { 操作者: session.name, 時間: now };
  if (changes.狀態 != null) set.狀態 = changes.狀態;
  if (changes.當天狀況 != null) set.當天狀況 = clean(changes.當天狀況);
  if (changes.備註 != null) set.備註 = clean(changes.備註);
  await smallGroupAttendance().upsertByKey(
    ['小組ID', '成員ID', '日期'],
    { 小組點名ID: newId('小組點名ID'), 小組ID: group.小組ID, 成員ID, 姓名: member.姓名, 日期: date, 狀態: '', 當天狀況: '', 備註: '', ...set },
    set,
  );
  return {};
}

/**
 * 把孩子加入小組（一個孩子同時只屬於一個小組：原本的小組自動離開，點名紀錄保留）。
 * markPresent：從「當天報到」加入時，同時點名出席。
 */
export async function addMember(小組ID: string, 成員ID: string, opts: { date?: string; markPresent?: boolean; 來源?: string } = {}): Promise<{ error?: string }> {
  const session = requireSession({ permission: 'smallgroups' });
  const group = await getGroup(session, 小組ID);
  const kid = (await members().all()).find((m) => m.成員ID === clean(成員ID));
  if (!kid) return { error: '找不到這位孩子' };
  await ensureSmallGroupTables();
  const date = isDate(opts.date) ? opts.date! : today();
  const current = (await smallGroupMembers().all({ fresh: true })).filter((m) => m.成員ID === kid.成員ID && !m.離開日期);
  if (current.some((m) => m.小組ID === group.小組ID)) return {};
  if (current.length) await smallGroupMembers().updateByIds(current.map((m) => ({ id: m.小組成員ID, changes: { 離開日期: date } })));
  await smallGroupMembers().append([
    { 小組成員ID: newId('小組成員ID'), 小組ID: group.小組ID, 成員ID: kid.成員ID, 姓名: kid.姓名, 加入日期: date, 離開日期: '', 來源: clean(opts.來源, 20) || '手動' },
  ]);
  if (opts.markPresent) await saveAttendance(group.小組ID, kid.成員ID, date, { 狀態: AttendanceStatus.Present });
  revalidatePath(`/g/${group.小組ID}`);
  return {};
}

/** 移出小組：記下離開日期（之前的點名紀錄保留） */
export async function removeMember(小組ID: string, 成員ID: string): Promise<{ error?: string }> {
  const session = requireSession({ permission: 'smallgroups' });
  const group = await getGroup(session, 小組ID);
  const rows = (await smallGroupMembers().all({ fresh: true })).filter((m) => m.小組ID === group.小組ID && m.成員ID === 成員ID && !m.離開日期);
  if (rows.length === 0) return { error: '這位孩子不在小組裡' };
  await smallGroupMembers().updateByIds(rows.map((m) => ({ id: m.小組成員ID, changes: { 離開日期: today() } })));
  revalidatePath(`/g/${group.小組ID}`);
  return {};
}

/** 小組設定：新增或修改小組（名稱、基地、排序、負責人、狀態、說明） */
export async function saveGroup(小組ID: string, _: FormResult, formData: FormData): Promise<FormResult> {
  requireSession({ permission: 'smallgroup-settings' });
  const s = (k: string) => clean(formData.get(k), 200);
  const 名稱 = s('name');
  if (!名稱) return { error: '請填寫小組名稱' };
  const 基地 = BASES.some((b) => b.short === s('base')) ? s('base') : '';
  if (!基地) return { error: '請選擇基地' };
  const fields = {
    名稱,
    基地,
    排序: String(Math.floor(Number(s('order')) || 0)),
    負責人: formData.getAll('leaders').map((v) => clean(v, 50)).filter(Boolean).join(','),
    狀態: s('status') === '停用' ? '停用' : '啟用',
    說明: s('note'),
  };
  const all = await listGroups();
  if (all.some((g) => g.名稱 === 名稱 && g.小組ID !== 小組ID)) return { error: `已經有「${名稱}」這個小組` };
  await ensureSmallGroupTables();
  if (小組ID) await smallGroups().updateByIds([{ id: 小組ID, changes: fields }]);
  else await smallGroups().append([{ 小組ID: newId('小組ID'), ...fields, 建立時間: nowString() }]);
  revalidatePath('/settings');
  revalidatePath('/');
  return { message: `已儲存「${名稱}」` };
}
