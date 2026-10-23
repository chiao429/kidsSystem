'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { GROUP_TYPES, GroupRole, GroupType, newId, nowString, splitList } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { getEvent } from './events';
import { writeLog } from './log';
import { accounts, groupMembers, groups } from './tables';

async function context(eventId: string) {
  const session = requireSession({ permission: 'admin', eventId });
  return { session, event: await getEvent(eventId) };
}

/** 新增或修改分組（課程：名稱、代碼、名額、說明、排序、狀態；小隊：名稱、區域、說明、排序、狀態） */
export async function saveGroup(eventId: string, 分組ID: string, 類型: string, _: FormResult, formData: FormData): Promise<FormResult> {
  const { session, event } = await context(eventId);
  if (!(GROUP_TYPES as string[]).includes(類型)) return { error: '無效的分組類型' };
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  const changes = {
    名稱: s('name'),
    代碼: s('code'),
    名額: s('capacity') && Number(s('capacity')) > 0 ? String(Number(s('capacity'))) : '',
    區域: s('area'),
    說明: s('note'),
    排序: s('order'),
    狀態: s('status') || '啟用',
  };
  if (!changes.名稱) return { error: '請填寫名稱' };
  const table = groups(event.活動ID);
  const all = await table.all({ fresh: true });
  if (all.some((g) => g.類型 === 類型 && g.名稱 === changes.名稱 && g.分組ID !== 分組ID)) return { error: `已有同名${類型}` };
  if (分組ID) {
    await table.updateByIds([{ id: 分組ID, changes }]);
  } else {
    const order = all.filter((g) => g.類型 === 類型).reduce((max, g) => Math.max(max, Number(g.排序) || 0), 0) + 1;
    await table.append([{ 分組ID: newId('分組ID'), 類型, ...changes, 排序: changes.排序 || String(order) }]);
  }
  await writeLog(event.活動ID, session, 分組ID ? `修改${類型}` : `新增${類型}`, 分組ID, changes.名稱);
  revalidatePath(`/events/${eventId}/groups`);
  return { message: '已儲存' };
}

/** 指派負責人（老師/小隊長/助理）：成員ID 填帳號 */
export async function addGroupLeader(eventId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  const { session, event } = await context(eventId);
  const 分組ID = String(formData.get('group') ?? '');
  const account = String(formData.get('account') ?? '').trim();
  const role = String(formData.get('role') ?? GroupRole.Teacher);
  const group = (await groups(event.活動ID).all()).find((g) => g.分組ID === 分組ID);
  if (!group) return { error: '請選擇分組' };
  const acc = (await accounts().all()).find((a) => a.帳號 === account);
  if (!acc) return { error: '找不到此帳號' };
  const table = groupMembers(event.活動ID);
  if ((await table.all({ fresh: true })).some((m) => m.分組ID === 分組ID && m.成員ID === account)) return { error: '此帳號已在該分組' };
  await table.append([
    { 分組成員ID: newId('分組成員ID'), 分組ID, 類型: group.類型 as GroupType, 成員ID: account, 姓名: acc.名稱 || account, 報名ID: '', 角色: role, 來源: '後台', 建立時間: nowString() },
  ]);
  await writeLog(event.活動ID, session, '指派負責人', 分組ID, `${group.名稱} ${role} ${account}`);
  revalidatePath(`/events/${eventId}/groups`);
  const events = splitList(acc.可管理活動);
  const canEnter = acc.角色 === 'admin' || events.includes('*') || events.includes(event.活動ID);
  return {
    message: `已指派 ${acc.名稱 || account} 為 ${group.名稱} ${role}${canEnter ? '' : `。注意：此帳號的「可管理活動」沒有 ${event.活動ID}，請到「帳號」頁加入，否則無法進入點名`}`,
  };
}

export async function removeGroupMember(eventId: string, 分組成員ID: string) {
  const { session, event } = await context(eventId);
  await groupMembers(event.活動ID).deleteByIds([分組成員ID]);
  await writeLog(event.活動ID, session, '移除分組成員', 分組成員ID);
  revalidatePath(`/events/${eventId}/groups`);
  revalidatePath(`/events/${eventId}/teams`);
}

/** 調整隊員所屬小隊與角色 */
export async function updateTeamMember(eventId: string, 分組成員ID: string, formData: FormData) {
  const { session, event } = await context(eventId);
  const 分組ID = String(formData.get('team') ?? '');
  const 角色 = String(formData.get('role') ?? '').trim();
  const team = (await groups(event.活動ID).all()).find((g) => g.分組ID === 分組ID && g.類型 === GroupType.Team);
  if (!team || !角色) return;
  await groupMembers(event.活動ID).updateByIds([{ id: 分組成員ID, changes: { 分組ID, 角色 } }]);
  await writeLog(event.活動ID, session, '調整隊員', 分組成員ID, `${team.名稱} ${角色}`);
  revalidatePath(`/events/${eventId}/teams`);
}
