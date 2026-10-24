'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { HouseholdTable, MemberTable, nowString } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { households, members } from './tables';

const HOUSEHOLD_FIELDS = (HouseholdTable.updatableBy?.admin ?? []).filter((h) => h !== '更新時間');
const MEMBER_FIELDS = (MemberTable.updatableBy?.admin ?? []).filter((h) => h !== '更新時間');

/** 表單欄位 name（必須是英文：Next 14 Server Action 會把中文 name 解壞，送來的值變空白） */
const HOUSEHOLD_FORM_NAMES: Record<string, string> = { 主要聯絡人: 'contact', 電話: 'phone', Email: 'email', 地址: 'address' };
const MEMBER_FORM_NAMES: Record<string, string> = {
  姓名: 'name', 性別: 'gender', 生日: 'birthday', 年級: 'grade', 學校: 'school', 類型: 'type', 特殊需求: 'needs',
};

/** 只送出有變動的欄位；表單沒有送出的欄位一律不動（避免被當成空白清掉） */
function diff<T extends string>(fields: readonly T[], formData: FormData, current: Record<string, string>, names: Record<string, string>) {
  const changes: Partial<Record<T | '更新時間', string>> = {};
  for (const f of fields) {
    const key = names[f];
    if (!key || !formData.has(key)) continue;
    const v = String(formData.get(key) ?? '').trim().slice(0, 200);
    if (v !== (current[f] ?? '')) changes[f] = v;
  }
  if (Object.keys(changes).length > 0) changes.更新時間 = nowString();
  return changes;
}

export async function saveHousehold(家庭ID: string, _: FormResult, formData: FormData): Promise<FormResult> {
  requireSession({ permission: 'admin' });
  const current = await households().findById(家庭ID, { fresh: true });
  if (!current) return { error: '找不到此家庭' };
  const changes = diff(HOUSEHOLD_FIELDS, formData, current, HOUSEHOLD_FORM_NAMES);
  if (Object.keys(changes).length === 0) return { message: '沒有變更' };
  await households().updateByIds([{ id: 家庭ID, changes }]);
  revalidatePath(`/families/${家庭ID}`);
  return { message: '已儲存家庭資料' };
}

export async function saveMember(成員ID: string, _: FormResult, formData: FormData): Promise<FormResult> {
  requireSession({ permission: 'admin' });
  const current = await members().findById(成員ID, { fresh: true });
  if (!current) return { error: '找不到此成員' };
  const changes = diff(MEMBER_FIELDS, formData, current, MEMBER_FORM_NAMES);
  if (Object.keys(changes).length === 0) return { message: '沒有變更' };
  await members().updateByIds([{ id: 成員ID, changes }]);
  revalidatePath(`/families/${current.家庭ID}`);
  return { message: `已儲存 ${changes.姓名 ?? current.姓名}` };
}
