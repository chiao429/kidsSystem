'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { EventStatus, EventVersion, GROUP_TYPES, type EventRules, type GroupType } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { sanitizeRichText } from '@kids/ui/rich-text';
import { dataBackend, extractSheetIdFromUrl } from '@kids/sheets-core';
import { ensureEventTables, events, registrations } from './tables';
import { getEvent, isSheetRequired } from './events';
import { writeLog } from './log';

/**
 * 讀取設定表單：只回傳表單上有的欄位。活動時間、地點、適用對象等舊欄位已不在表單上，
 * 不寫入就會保留原值；報名規則也與原本的規則合併，表單沒有的設定不會被清掉。
 */
function readEventForm(formData: FormData, current: EventRules = {}) {
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  const groupTypes = formData.getAll('groupTypes').map(String).filter((t): t is GroupType => (GROUP_TYPES as string[]).includes(t));
  const rules: EventRules = {
    ...current,
    groupTypes,
    minGrade: s('minGrade') || undefined,
    maxGrade: s('maxGrade') || undefined,
    capacity: Number(s('capacity')) || 0,
    autoAccept: formData.get('autoAccept') === 'on',
    existingOnly: formData.get('existingOnly') === 'on',
    maxCoursesPerMember: Math.max(0, Math.floor(Number(s('maxCoursesPerMember')) || 0)),
    allowOnSiteCourseRegistration: formData.get('allowOnSiteCourseRegistration') === 'on',
  };
  const status = s('status');
  return {
    活動ID: s('id'),
    名稱: s('name'),
    活動試算表: s('sheet'),
    開始日期: s('startDate'),
    結束日期: s('endDate'),
    報名開放: s('regOpen'),
    報名截止: s('regClose'),
    報名規則: JSON.stringify(rules),
    // 封存只能從活動清單操作
    狀態: status === EventStatus.Archived ? EventStatus.Draft : status,
    // 活動說明在自己的分頁編輯；表單有送這個欄位時才寫入，否則保留原值
    ...(formData.has('description') ? { 活動說明: sanitizeRichText(s('description')) } : {}),
  };
}

/** 沒填試算表時：本機 JSON 模式用 event-<活動ID>.json；Mongo 模式留空（不建立鏡像） */
function sheetOrDefault(eventId: string, sheet: string) {
  if (sheet) return sheet;
  return process.env.SHEETS_LOCAL_DIR && dataBackend() !== 'mongo' ? `event-${eventId}` : '';
}

export async function createEvent(_: FormResult, formData: FormData): Promise<FormResult> {
  const session = requireSession({ permission: 'admin', allEvents: true });
  const form = readEventForm(formData);
  if (!/^[A-Za-z0-9_-]+$/.test(form.活動ID)) return { error: '活動ID 只能使用英數字、- 與 _' };
  if (!form.名稱 || !form.開始日期) return { error: '請填寫活動名稱與開始日期' };
  if (!form.活動試算表 && isSheetRequired()) return { error: '請在「進階設定」填寫活動試算表連結' };
  if (await events().findById(form.活動ID, { fresh: true })) return { error: '活動ID 已存在' };
  const row = { ...form, 活動試算表: sheetOrDefault(form.活動ID, form.活動試算表), 版本: EventVersion.Kids };
  try {
    // 先初始化活動資料（有試算表時一併確認 service account 權限）再寫入活動
    await ensureEventTables(row.活動ID, extractSheetIdFromUrl(row.活動試算表));
  } catch (e) {
    return { error: `無法存取活動試算表，請確認已共用給 service account：${e instanceof Error ? e.message : e}` };
  }
  await events().append([row]);
  await writeLog(row.活動ID, session, '建立活動', row.活動ID);
  redirect(`/events/${row.活動ID}`);
}

export async function updateEvent(eventId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const { 活動ID: _id, ...changes } = readEventForm(formData, event.rules);
  if (!changes.名稱 || !changes.開始日期) return { error: '請填寫活動名稱與開始日期' };
  if (!changes.活動試算表 && isSheetRequired()) return { error: '請在「進階設定」填寫活動試算表連結' };
  // 已封存的活動維持封存（要還原請到活動清單）
  if (event.狀態 === EventStatus.Archived) changes.狀態 = EventStatus.Archived;
  await events().ensure();
  await events().updateByIds([{ id: eventId, changes }]);
  await writeLog(event.活動ID, session, '更新活動', eventId);
  revalidatePath(`/events/${eventId}`);
  return { message: '已儲存' };
}

/** 刪除＝封存：資料全部保留，各系統清單與家長端都不再顯示；需輸入活動ID 確認 */
export async function archiveEvent(eventId: string, formData: FormData) {
  const session = requireSession({ permission: 'admin', allEvents: true });
  if (String(formData.get('confirm') ?? '').trim() !== eventId) return;
  const event = await getEvent(eventId);
  if (event.狀態 === EventStatus.Archived) return;
  // 封存前的狀態記在報名規則裡，還原時恢復
  const rules: EventRules = { ...event.rules, statusBeforeArchive: event.狀態 || EventStatus.Draft };
  await events().updateByIds([{ id: eventId, changes: { 狀態: EventStatus.Archived, 報名規則: JSON.stringify(rules) } }]);
  await writeLog(eventId, session, '封存活動', eventId, `原狀態：${rules.statusBeforeArchive}`);
  revalidatePath('/');
}

export async function restoreEvent(eventId: string) {
  const session = requireSession({ permission: 'admin', allEvents: true });
  const event = await getEvent(eventId);
  if (event.狀態 !== EventStatus.Archived) return;
  const { statusBeforeArchive, ...rules } = event.rules;
  // 還原後先不開放報名，避免家長在管理者確認前就看到
  const status = statusBeforeArchive === EventStatus.Open ? EventStatus.Closed : statusBeforeArchive || EventStatus.Draft;
  await events().updateByIds([{ id: eventId, changes: { 狀態: status, 報名規則: JSON.stringify(rules) } }]);
  await writeLog(eventId, session, '還原活動', eventId, `狀態：${status}`);
  revalidatePath('/');
}

/** 永久刪除：只限已封存且沒有任何報名的活動（活動資料表本身保留，不會影響其他活動） */
export async function purgeEvent(eventId: string, formData: FormData) {
  const session = requireSession({ permission: 'admin', allEvents: true });
  if (String(formData.get('confirm') ?? '').trim() !== eventId) return;
  const event = await getEvent(eventId);
  if (event.狀態 !== EventStatus.Archived) return;
  if ((await registrations(eventId).all({ fresh: true })).length > 0) return;
  await events().deleteByIds([eventId]);
  // 活動刪除後它的日誌頁已無入口，改記在伺服器 log（Cloud Run 可查）
  console.info(`[purgeEvent] ${session.account} 永久刪除活動 ${eventId}（${event.名稱}）`);
  revalidatePath('/');
}

export async function initEventSheet(eventId: string) {
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  await ensureEventTables(event.活動ID, event.sheetId);
  await writeLog(event.活動ID, session, '初始化活動試算表', eventId);
  revalidatePath(`/events/${eventId}`);
}
