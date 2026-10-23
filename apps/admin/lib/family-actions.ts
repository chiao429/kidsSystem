'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { HouseholdTable, MemberTable, nowString } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { households, members } from './tables';

const HOUSEHOLD_FIELDS = (HouseholdTable.updatableBy?.admin ?? []).filter((h) => h !== '更新時間');
const MEMBER_FIELDS = (MemberTable.updatableBy?.admin ?? []).filter((h) => h !== '更新時間');

/** 只送出有變動的欄位 */
function diff<T extends string>(fields: readonly T[], formData: FormData, current: Record<string, string>) {
  const changes: Partial<Record<T | '更新時間', string>> = {};
  for (const f of fields) {
    const v = String(formData.get(f) ?? '').trim().slice(0, 200);
    if (v !== (current[f] ?? '')) changes[f] = v;
  }
  if (Object.keys(changes).length > 0) changes.更新時間 = nowString();
  return changes;
}

export async function saveHousehold(家庭ID: string, _: FormResult, formData: FormData): Promise<FormResult> {
  requireSession({ roles: ['admin', 'manager'] });
  const current = await households().findById(家庭ID, { fresh: true });
  if (!current) return { error: '找不到此家庭' };
  const changes = diff(HOUSEHOLD_FIELDS, formData, current);
  if (Object.keys(changes).length === 0) return { message: '沒有變更' };
  await households().updateByIds([{ id: 家庭ID, changes }]);
  revalidatePath(`/families/${家庭ID}`);
  return { message: '已儲存家庭資料' };
}

export async function saveMember(成員ID: string, _: FormResult, formData: FormData): Promise<FormResult> {
  requireSession({ roles: ['admin', 'manager'] });
  const current = await members().findById(成員ID, { fresh: true });
  if (!current) return { error: '找不到此成員' };
  const changes = diff(MEMBER_FIELDS, formData, current);
  if (Object.keys(changes).length === 0) return { message: '沒有變更' };
  await members().updateByIds([{ id: 成員ID, changes }]);
  revalidatePath(`/families/${current.家庭ID}`);
  return { message: `已儲存 ${changes.姓名 ?? current.姓名}` };
}
