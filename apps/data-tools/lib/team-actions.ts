'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { newId } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { divide } from './divide';
import { getEvent } from './events';
import { groupByGrade, loadRoster } from './roster';
import { teams } from './tables';

const MEMBER = '隊員';

export async function autoDivide(eventId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  requireSession({ roles: ['admin', 'manager'], eventId });
  const event = await getEvent(eventId);
  const group = String(formData.get('group') ?? '');
  const teamCount = Number(formData.get('teamCount'));
  const pattern = String(formData.get('pattern') ?? '').trim();
  const keepSiblingsTogether = formData.get('keepSiblings') === 'on';
  if (!group || !pattern || !(teamCount >= 1)) return { error: '請選擇組別並填寫隊數與小隊名稱' };

  const kids = groupByGrade(await loadRoster(event.sheetId)).find((g) => g.group === group)?.kids ?? [];
  if (kids.length === 0) return { error: `${group} 沒有正取的報名者` };
  const result = divide(kids, { teamCount, pattern, keepSiblingsTogether });

  // 保留：其他組別的隊員、所有小隊長；取代：此組別的隊員
  const table = teams(event.sheetId);
  const existing = await table.all({ fresh: true });
  const kidIds = new Set(kids.map((k) => k.成員ID));
  const kept = existing.filter((r) => !(r.角色 === MEMBER && (r.區域 === group || kidIds.has(r.成員ID))));
  const created = [...result.entries()].flatMap(([小隊, list]) =>
    list.map((k) => ({ 小隊成員ID: newId('小隊成員ID'), 小隊, 成員ID: k.成員ID, 姓名: k.姓名, 角色: MEMBER, 區域: group })),
  );
  await table.replaceAll([...kept, ...created]);
  revalidatePath(`/e/${eventId}/teams`);
  const sizes = [...result.entries()].map(([name, list]) => `${name}：${list.length}`).join('、');
  return { message: `${group} 已分成 ${result.size} 隊（${sizes}）` };
}

export async function moveMember(eventId: string, 成員ID: string, 姓名: string, formData: FormData) {
  requireSession({ roles: ['admin', 'manager'], eventId });
  const event = await getEvent(eventId);
  const team = String(formData.get('team') ?? '');
  const table = teams(event.sheetId);
  const rows = await table.all({ fresh: true });
  const row = rows.find((r) => r.成員ID === 成員ID && r.角色 === MEMBER);
  if (!team) {
    if (row) await table.deleteByIds([row.小隊成員ID]);
  } else {
    const 區域 = rows.find((r) => r.小隊 === team)?.區域 ?? '';
    if (row) await table.updateByIds([{ id: row.小隊成員ID, changes: { 小隊: team, 區域 } }]);
    else await table.append([{ 小隊成員ID: newId('小隊成員ID'), 小隊: team, 成員ID, 姓名, 角色: MEMBER, 區域 }]);
  }
  revalidatePath(`/e/${eventId}/teams`);
}

export async function addLeader(eventId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  requireSession({ roles: ['admin', 'manager'], eventId });
  const event = await getEvent(eventId);
  const team = String(formData.get('team') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const role = String(formData.get('role') ?? '小隊長');
  const account = String(formData.get('account') ?? '').trim();
  if (!team || !name) return { error: '請填寫小隊與姓名' };
  const table = teams(event.sheetId);
  const 區域 = (await table.all()).find((r) => r.小隊 === team)?.區域 ?? '';
  await table.append([{ 小隊成員ID: newId('小隊成員ID'), 小隊: team, 成員ID: account, 姓名: name, 角色: role, 區域 }]);
  revalidatePath(`/e/${eventId}/teams`);
  return { message: `已加入 ${team} ${role}：${name}` };
}

export async function removeTeamRow(eventId: string, id: string) {
  requireSession({ roles: ['admin', 'manager'], eventId });
  const event = await getEvent(eventId);
  await teams(event.sheetId).deleteByIds([id]);
  revalidatePath(`/e/${eventId}/teams`);
}
