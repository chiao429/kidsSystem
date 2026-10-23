'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { GroupRole, GroupType, newId, nowString } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { divide } from './divide';
import { getEvent } from './events';
import { groupByGrade, loadRoster } from './roster';
import { groupMembers, groups } from './tables';

const MEMBER = GroupRole.Member;

async function context(eventId: string) {
  requireSession({ roles: ['admin', 'manager'], eventId });
  return getEvent(eventId);
}

/** 依名稱取得小隊分組，沒有就建立；回傳 分組ID */
async function ensureTeams(eventId: string, names: string[], 區域: string): Promise<Map<string, string>> {
  const table = groups(eventId);
  const existing = (await table.all({ fresh: true })).filter((g) => g.類型 === GroupType.Team);
  const idByName = new Map(existing.map((g) => [g.名稱, g.分組ID]));
  let order = existing.reduce((max, g) => Math.max(max, Number(g.排序) || 0), 0);
  const created = names
    .filter((n) => !idByName.has(n))
    .map((名稱) => {
      const 分組ID = newId('分組ID');
      idByName.set(名稱, 分組ID);
      return { 分組ID, 類型: GroupType.Team, 名稱, 代碼: '', 名額: '', 區域, 說明: '', 排序: String(++order), 狀態: '啟用' };
    });
  await table.append(created);
  return idByName;
}

export async function autoDivide(eventId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  const event = await context(eventId);
  const group = String(formData.get('group') ?? '');
  const teamCount = Number(formData.get('teamCount'));
  const pattern = String(formData.get('pattern') ?? '').trim();
  const keepSiblingsTogether = formData.get('keepSiblings') === 'on';
  if (!group || !pattern || !(teamCount >= 1)) return { error: '請選擇組別並填寫隊數與小隊名稱' };

  const kids = groupByGrade(await loadRoster(event.活動ID)).find((g) => g.group === group)?.kids ?? [];
  if (kids.length === 0) return { error: `${group} 沒有正取的報名者` };
  const result = divide(kids, { teamCount, pattern, keepSiblingsTogether });
  const idByName = await ensureTeams(event.活動ID, [...result.keys()], group);

  // 取代：此組別（區域）小隊的隊員，以及這次分到的孩子原本的隊員列；保留：小隊長與課程成員
  const areaTeamIds = (await groups(event.活動ID).all({ fresh: true }))
    .filter((g) => g.類型 === GroupType.Team && g.區域 === group)
    .map((g) => g.分組ID);
  const kidIds = kids.map((k) => k.成員ID);
  const now = nowString();
  const table = groupMembers(event.活動ID);
  const regByMember = new Map(kids.map((k) => [k.成員ID, k.報名ID]));
  const created = [...result.entries()].flatMap(([小隊, list]) =>
    list.map((k) => ({
      分組成員ID: newId('分組成員ID'),
      分組ID: idByName.get(小隊)!,
      類型: GroupType.Team,
      成員ID: k.成員ID,
      姓名: k.姓名,
      報名ID: regByMember.get(k.成員ID) ?? '',
      角色: MEMBER,
      來源: '分隊',
      建立時間: now,
    })),
  );
  await table.replaceWhere({ 類型: GroupType.Team, 角色: MEMBER, 分組ID: { $in: areaTeamIds } }, []);
  await table.replaceWhere({ 類型: GroupType.Team, 角色: MEMBER, 成員ID: { $in: kidIds } }, created);
  revalidatePath(`/e/${eventId}/teams`);
  const sizes = [...result.entries()].map(([name, list]) => `${name}：${list.length}`).join('、');
  return { message: `${group} 已分成 ${result.size} 隊（${sizes}）` };
}

/** 把一位孩子移到某小隊（分組ID）；空白表示移出小隊 */
export async function moveMember(eventId: string, 成員ID: string, 姓名: string, formData: FormData) {
  const event = await context(eventId);
  const 分組ID = String(formData.get('team') ?? '');
  const table = groupMembers(event.活動ID);
  const row = (await table.all({ fresh: true })).find((r) => r.類型 === GroupType.Team && r.成員ID === 成員ID && r.角色 === MEMBER);
  if (!分組ID) {
    if (row) await table.deleteByIds([row.分組成員ID]);
  } else if (row) {
    await table.updateByIds([{ id: row.分組成員ID, changes: { 分組ID } }]);
  } else {
    const reg = (await loadRoster(event.活動ID)).find((k) => k.成員ID === 成員ID);
    await table.append([
      { 分組成員ID: newId('分組成員ID'), 分組ID, 類型: GroupType.Team, 成員ID, 姓名, 報名ID: reg?.報名ID ?? '', 角色: MEMBER, 來源: '分隊', 建立時間: nowString() },
    ]);
  }
  revalidatePath(`/e/${eventId}/teams`);
}

export async function addLeader(eventId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  const event = await context(eventId);
  const 分組ID = String(formData.get('team') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const role = String(formData.get('role') ?? GroupRole.Leader);
  const account = String(formData.get('account') ?? '').trim();
  if (!分組ID || !name) return { error: '請選擇小隊並填寫姓名' };
  const team = (await groups(event.活動ID).all()).find((g) => g.分組ID === 分組ID);
  if (!team) return { error: '找不到此小隊' };
  await groupMembers(event.活動ID).append([
    { 分組成員ID: newId('分組成員ID'), 分組ID, 類型: GroupType.Team, 成員ID: account, 姓名: name, 報名ID: '', 角色: role, 來源: '分隊', 建立時間: nowString() },
  ]);
  revalidatePath(`/e/${eventId}/teams`);
  return { message: `已加入 ${team.名稱} ${role}：${name}` };
}

export async function removeTeamRow(eventId: string, id: string) {
  const event = await context(eventId);
  await groupMembers(event.活動ID).deleteByIds([id]);
  revalidatePath(`/e/${eventId}/teams`);
}

/** 新增小隊或修改名稱、區域、說明、排序、狀態 */
export async function saveTeam(eventId: string, 分組ID: string, _: FormResult, formData: FormData): Promise<FormResult> {
  const event = await context(eventId);
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  const changes = { 名稱: s('name'), 區域: s('area'), 說明: s('note'), 排序: s('order'), 狀態: s('status') || '啟用' };
  if (!changes.名稱) return { error: '請填寫小隊名稱' };
  const table = groups(event.活動ID);
  const all = await table.all({ fresh: true });
  if (all.some((g) => g.類型 === GroupType.Team && g.名稱 === changes.名稱 && g.分組ID !== 分組ID)) return { error: '已有同名小隊' };
  if (分組ID) await table.updateByIds([{ id: 分組ID, changes }]);
  else await table.append([{ 分組ID: newId('分組ID'), 類型: GroupType.Team, 代碼: '', 名額: '', ...changes }]);
  revalidatePath(`/e/${eventId}/teams`);
  return { message: '已儲存' };
}
