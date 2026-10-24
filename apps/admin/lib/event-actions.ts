'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { GROUP_TYPES, type EventRules, type GroupType } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { extractSheetIdFromUrl } from '@kids/sheets-core';
import { ensureEventTables, events } from './tables';
import { getEvent } from './events';
import { writeLog } from './log';

function readEventForm(formData: FormData) {
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  const groupTypes = formData.getAll('groupTypes').map(String).filter((t): t is GroupType => (GROUP_TYPES as string[]).includes(t));
  const rules: EventRules = {
    groupTypes,
    minGrade: s('minGrade') || undefined,
    maxGrade: s('maxGrade') || undefined,
    capacity: Number(s('capacity')) || 0,
    autoAccept: formData.get('autoAccept') === 'on',
    existingOnly: formData.get('existingOnly') === 'on',
    maxCoursesPerMember: Math.max(0, Math.floor(Number(s('maxCoursesPerMember')) || 0)),
    allowOnSiteCourseRegistration: formData.get('allowOnSiteCourseRegistration') === 'on',
  };
  return {
    活動ID: s('id'),
    名稱: s('name'),
    版本: s('version'),
    活動試算表: s('sheet'),
    開始日期: s('startDate'),
    結束日期: s('endDate'),
    活動時間: s('eventTime'),
    地點: s('venue'),
    報到時間: s('checkInTime'),
    繳費時間: s('paymentTime'),
    活動說明: s('description'),
    適用對象: s('audience'),
    報名提醒: s('reminder'),
    報名開放: s('regOpen'),
    報名截止: s('regClose'),
    報名規則: JSON.stringify(rules),
    狀態: s('status'),
    備註: s('note'),
  };
}

export async function createEvent(_: FormResult, formData: FormData): Promise<FormResult> {
  const session = requireSession({ permission: 'admin', allEvents: true });
  const row = readEventForm(formData);
  if (!/^[A-Za-z0-9_-]+$/.test(row.活動ID)) return { error: '活動ID 只能使用英數字、- 與 _' };
  if (!row.名稱 || !row.活動試算表) return { error: '請填寫名稱與活動試算表連結' };
  if (await events().findById(row.活動ID, { fresh: true })) return { error: '活動ID 已存在' };
  const sheetId = extractSheetIdFromUrl(row.活動試算表);
  try {
    // 先初始化活動試算表，確認 service account 有權限再寫入活動
    await ensureEventTables(row.活動ID, sheetId);
  } catch (e) {
    return { error: `無法存取活動試算表，請確認已共用給 service account：${e instanceof Error ? e.message : e}` };
  }
  await events().append([row]);
  await writeLog(row.活動ID, session, '建立活動', row.活動ID);
  redirect(`/events/${row.活動ID}`);
}

export async function updateEvent(eventId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  const session = requireSession({ permission: 'admin', eventId });
  const { 活動ID: _id, ...changes } = readEventForm(formData);
  if (!changes.名稱 || !changes.活動試算表) return { error: '請填寫名稱與活動試算表連結' };
  await events().ensure();
  await events().updateByIds([{ id: eventId, changes }]);
  const event = await getEvent(eventId);
  await writeLog(event.活動ID, session, '更新活動', eventId);
  revalidatePath(`/events/${eventId}`);
  return { message: '已儲存' };
}

export async function initEventSheet(eventId: string) {
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  await ensureEventTables(event.活動ID, event.sheetId);
  await writeLog(event.活動ID, session, '初始化活動試算表', eventId);
  revalidatePath(`/events/${eventId}`);
}
