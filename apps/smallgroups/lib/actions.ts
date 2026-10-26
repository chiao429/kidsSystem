'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { AttendanceStatus, BASES, newId, nowString } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { attendanceOn, checkedInOn, getGroup, isDate, kidDirectory, listGroups, rosterOn, today, visibleGroups, type SmallGroup } from './data';
import type { ImportRow } from './member-sheet';

type KidInfo = { 成員ID: string; 姓名: string; 電話: string; 基地: string };
import { accounts, ensureSmallGroupTables, members, smallGroupAttendance, smallGroupMeetings, smallGroupMembers, smallGroups } from './tables';
import { buildReport } from './report';
import { LINE_GROUP_KEY, lineGroupId, pushLineText } from './line';
import { setSetting } from '@kids/sheets-core';

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

type ImportResult = { error?: string; added?: number; already?: number; problems?: string[] };

/** 把一批列（附原始列號）匯入指定小組：依成員ID 或姓名＋家長電話找到同基地的孩子 */
async function importInto(group: SmallGroup, rows: { row: ImportRow; line: number }[], kids: KidInfo[]): Promise<Required<Omit<ImportResult, 'error'>>> {
  const digits = (v: string) => v.replace(/\D/g, '');
  const problems: string[] = [];
  const picked = new Set<string>();
  for (const { row: r, line } of rows) {
    const 姓名 = clean(r.姓名, 50);
    const 電話 = digits(clean(r.家長電話, 30));
    const id = clean(r.成員ID, 50);
    if (!id && !姓名) continue;
    const matches = id ? kids.filter((k) => k.成員ID === id) : kids.filter((k) => k.姓名 === 姓名 && (!電話 || digits(k.電話) === 電話));
    const label = `第 ${line} 列（${姓名 || id}）`;
    if (matches.length === 0) problems.push(`${label}：找不到這位孩子，請確認姓名與家長電話`);
    else if (matches.length > 1) problems.push(`${label}：有 ${matches.length} 位同名的孩子，請填家長電話`);
    else if (matches[0].基地 !== group.基地) problems.push(`${label}：是${matches[0].基地}的孩子，不能加入${group.基地}的「${group.名稱}」`);
    else picked.add(matches[0].成員ID);
  }
  const current = new Set((await rosterOn(group.小組ID, today())).map((m) => m.成員ID));
  let added = 0;
  for (const id of picked) {
    if (current.has(id)) continue;
    const res = await addMember(group.小組ID, id, { 來源: '匯入' });
    if (res.error) problems.push(res.error);
    else added++;
  }
  revalidatePath(`/g/${group.小組ID}/members`);
  return { added, already: [...picked].filter((id) => current.has(id)).length, problems };
}

/**
 * 匯入組員（單一小組）：已在其他小組的孩子會換過來；檔案裡沒有的組員不會被移出。
 */
export async function importMembers(小組ID: string, rows: ImportRow[]): Promise<ImportResult> {
  const session = requireSession({ permission: 'smallgroups' });
  const group = await getGroup(session, 小組ID);
  if (rows.length > 500) return { error: '一次最多匯入 500 筆' };
  const kids = [...(await kidDirectory()).values()];
  return importInto(group, rows.map((row, i) => ({ row, line: i + 2 })), kids);
}

/** 匯入所有小組的組員：每列多一個「小組名稱」，依名稱分到各小組（只能匯入自己看得到的小組） */
export async function importAllMembers(rows: (ImportRow & { 小組名稱: string })[]): Promise<ImportResult> {
  const session = requireSession({ permission: 'smallgroups' });
  if (rows.length > 2000) return { error: '一次最多匯入 2000 筆' };
  const groups = await visibleGroups(session);
  const kids = [...(await kidDirectory()).values()];
  const problems: string[] = [];
  const byGroup = new Map<string, { row: ImportRow; line: number }[]>();
  rows.forEach((row, i) => {
    const name = clean(row.小組名稱, 50);
    if (!name && !row.姓名 && !row.成員ID) return;
    const g = groups.find((x) => x.名稱 === name);
    if (!g) return void problems.push(`第 ${i + 2} 列：找不到小組「${name || '（空白）'}」，請確認名稱與「小組設定」相同`);
    byGroup.set(g.小組ID, [...(byGroup.get(g.小組ID) ?? []), { row, line: i + 2 }]);
  });
  let added = 0;
  let already = 0;
  for (const [id, list] of byGroup) {
    const res = await importInto(groups.find((g) => g.小組ID === id)!, list, kids);
    added += res.added;
    already += res.already;
    problems.push(...res.problems);
  }
  revalidatePath('/');
  return { added, already, problems };
}

/**
 * 匯入小組設定：依「小組名稱」新增或更新；負責人填帳號（逗號分隔）。檔案裡沒有的小組不會被刪除或停用。
 */
export async function importGroups(rows: Record<string, string>[]): Promise<ImportResult & { updated?: number }> {
  const session = requireSession({ permission: 'smallgroup-settings' });
  if (rows.length > 200) return { error: '一次最多匯入 200 個小組' };
  const existing = await listGroups();
  const accountIds = new Set((await accounts().all()).map((a) => a.帳號));
  const problems: string[] = [];
  let added = 0;
  let updated = 0;
  await ensureSmallGroupTables();
  const now = nowString();
  for (const [i, r] of rows.entries()) {
    const line = `第 ${i + 2} 列`;
    const 名稱 = clean(r.小組名稱, 50);
    if (!名稱) continue;
    const 基地 = clean(r.基地, 10).replace(/基地$/, '');
    if (!BASES.some((b) => b.short === 基地)) {
      problems.push(`${line}（${名稱}）：基地要填「思麥特」或「夢夢」`);
      continue;
    }
    const leaders = clean(r.負責人帳號, 500).split(/[,，、\s]+/).filter(Boolean);
    const unknown = leaders.filter((a) => !accountIds.has(a));
    if (unknown.length) problems.push(`${line}（${名稱}）：找不到帳號 ${unknown.join('、')}，已略過這些負責人`);
    const fields = {
      名稱,
      基地,
      排序: String(Math.floor(Number(clean(r.排序, 10))) || 0),
      狀態: clean(r.狀態, 10) === '停用' ? '停用' : '啟用',
      說明: clean(r.說明, 200),
      負責人: leaders.filter((a) => accountIds.has(a)).join(','),
    };
    const g = existing.find((x) => x.名稱 === 名稱);
    if (g) {
      await smallGroups().updateByIds([{ id: g.小組ID, changes: fields }]);
      updated++;
    } else {
      await smallGroups().append([{ 小組ID: newId('小組ID'), ...fields, 建立時間: now }]);
      added++;
    }
  }
  revalidatePath('/settings');
  revalidatePath('/');
  return { added, updated, already: 0, problems };
}

/** 線上聚會與個別線上分享的人數（組長填數字，週日人數由點名計算） */
export async function saveMeeting(
  小組ID: string,
  date: string,
  fields: { 線上總人數?: string; 線上新朋友?: string; 線上同工?: string; 個別線上分享?: string },
): Promise<{ error?: string }> {
  const session = requireSession({ permission: 'smallgroups' });
  if (!isDate(date)) return { error: '日期格式錯誤' };
  const group = await getGroup(session, 小組ID);
  const set: Record<string, string> = { 操作者: session.name, 時間: nowString() };
  for (const k of ['線上總人數', '線上新朋友', '線上同工', '個別線上分享'] as const) {
    const v = fields[k];
    if (v == null) continue;
    const n = Math.floor(Number(v));
    if (v !== '' && (!Number.isFinite(n) || n < 0)) return { error: '人數必須是 0 以上的整數' };
    set[k] = v === '' ? '' : String(n);
  }
  await ensureSmallGroupTables();
  await smallGroupMeetings().upsertByKey(
    ['小組ID', '日期'],
    { 小組聚會ID: newId('小組聚會ID'), 小組ID: group.小組ID, 日期: date, 線上總人數: '', 線上新朋友: '', 線上同工: '', 個別線上分享: '', ...set },
    set,
  );
  return {};
}

/** 立即推送指定日期的統計到 LINE 群組（小組設定權限） */
export async function pushReportNow(date: string): Promise<{ error?: string; message?: string }> {
  requireSession({ permission: 'smallgroup-settings' });
  if (!isDate(date)) return { error: '日期格式錯誤' };
  const report = await buildReport(date);
  const res = await pushLineText(await lineGroupId(), report.text);
  return res.ok ? { message: '已推送到 LINE 群組' } : { error: res.error };
}

/** 手動設定推播的 LINE 群組 ID（webhook 沒收到時使用） */
export async function setLineGroup(_: FormResult, formData: FormData): Promise<FormResult> {
  const session = requireSession({ permission: 'smallgroup-settings' });
  const id = clean(formData.get('groupId'), 100);
  if (id && !/^C[0-9a-f]{32}$/.test(id)) return { error: 'LINE 群組 ID 格式是 C 開頭、後面 32 碼英數字' };
  try {
    await setSetting(LINE_GROUP_KEY, id, session.name);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath('/report');
  return { message: id ? '已設定 LINE 群組' : '已清除 LINE 群組' };
}

/**
 * 直接刪除小組（無法復原）：一併刪除這個小組的組員紀錄、點名紀錄與線上聚會人數；孩子本身的資料不受影響。
 */
export async function deleteGroup(小組ID: string): Promise<{ error?: string }> {
  const session = requireSession({ permission: 'smallgroup-settings' });
  const group = (await listGroups()).find((g) => g.小組ID === 小組ID);
  if (!group) return { error: '找不到這個小組' };
  await ensureSmallGroupTables();
  const [mm, aa, gm] = await Promise.all([smallGroupMembers().all({ fresh: true }), smallGroupAttendance().all({ fresh: true }), smallGroupMeetings().all({ fresh: true })]);
  await smallGroupMembers().deleteByIds(mm.filter((m) => m.小組ID === 小組ID).map((m) => m.小組成員ID));
  await smallGroupAttendance().deleteByIds(aa.filter((a) => a.小組ID === 小組ID).map((a) => a.小組點名ID));
  await smallGroupMeetings().deleteByIds(gm.filter((m) => m.小組ID === 小組ID).map((m) => m.小組聚會ID));
  await smallGroups().deleteByIds([小組ID]);
  console.info(`[deleteGroup] ${session.account} 刪除小組 ${group.名稱}（${小組ID}）`);
  revalidatePath('/settings');
  revalidatePath('/');
  return {};
}
