'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { EventStatus, EventVersion, GROUP_TYPES, newId, parseCoursePanels, type EventRules, type GroupType } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { sanitizeRichText } from '@kids/ui/rich-text';
import { dataBackend, extractSheetIdFromUrl } from '@kids/sheets-core';
import { ensureEventTables, events, groups, registrations, schedules, surveys } from './tables';
import { getEvent, isSheetRequired } from './events';
import { writeLog } from './log';
import { OTHER, dateLabel, formatDated } from './event-info';

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
    allowCourseChange: formData.get('allowCourseChange') === 'on',
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

/** 複製活動時沿用的活動欄位（報名頁內容）；名稱、日期、報名時間與規則以表單為準 */
const COPIED_EVENT_COLUMNS = ['活動時間', '地點', '報到時間', '繳費時間', '活動說明', '適用對象', '報名提醒', '備註', '簽名檔', '分組說明'] as const;

/** 複製課程、小隊、時間表與問卷到新活動（換新 ID；時間表的分組ID 對應到新的分組） */
async function copyEventContent(fromId: string, toId: string) {
  const [srcGroups, srcSchedules, srcSurveys] = await Promise.all([groups(fromId).all(), schedules(fromId).all(), surveys(fromId).all()]);
  const groupIdMap = new Map(srcGroups.map((g) => [g.分組ID, newId('分組ID')]));
  if (srcGroups.length) await groups(toId).append(srcGroups.map((g) => ({ ...g, 分組ID: groupIdMap.get(g.分組ID)! })));
  // 分組已不存在的時段改為不限分組，避免指向舊活動的分組
  if (srcSchedules.length)
    await schedules(toId).append(srcSchedules.map((s) => ({ ...s, 時段ID: newId('時段ID'), 分組ID: s.分組ID ? groupIdMap.get(s.分組ID) ?? '' : '' })));
  if (srcSurveys.length) await surveys(toId).append(srcSurveys.map((s) => ({ ...s, 問卷ID: newId('問卷ID') })));
}

export async function createEvent(_: FormResult, formData: FormData): Promise<FormResult> {
  const session = requireSession({ permission: 'admin', allEvents: true });
  const copyFromId = String(formData.get('copyFrom') ?? '').trim();
  const source = copyFromId ? await getEvent(copyFromId).catch(() => undefined) : undefined;
  if (copyFromId && !source) return { error: '找不到要複製的活動' };
  const form = { ...readEventForm(formData, source && { ...source.rules, statusBeforeArchive: undefined }), ...(source ? Object.fromEntries(COPIED_EVENT_COLUMNS.map((c) => [c, source[c] ?? ''])) : {}) };
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
  if (source) await copyEventContent(source.活動ID, row.活動ID);
  await writeLog(row.活動ID, session, source ? '複製活動' : '建立活動', row.活動ID, source ? `來源：${source.活動ID}` : undefined);
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

/** 活動說明分頁的「時間與地點」：組成家長看到的文字後存進活動時間、地點、報到時間 */
export async function saveEventInfo(eventId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const s = (k: string) => String(formData.get(k) ?? '').trim().slice(0, 100);
  // radio 選「其他」時用旁邊輸入框的文字
  const pick = (choice: string, other: string) => (s(choice) === OTHER ? s(other) : s(choice));
  const date = s('infoDate');
  const checkinDate = s('checkinDate');
  if ((date && !dateLabel(date)) || (checkinDate && !dateLabel(checkinDate))) return { error: '日期格式不正確' };
  const changes = {
    活動時間: formatDated(date, pick('infoTime', 'infoTimeOther')),
    地點: pick('venue', 'venueOther'),
    報到時間: formatDated(checkinDate, pick('checkinTime', 'checkinTimeOther'), s('checkinSuffix')),
  };
  if (!date && changes.活動時間) return { error: '請選擇活動日期' };
  if (!checkinDate && changes.報到時間) return { error: '請選擇報到日期' };
  await events().updateByIds([{ id: eventId, changes }]);
  await writeLog(event.活動ID, session, '更新時間與地點', eventId, [changes.活動時間, changes.地點, changes.報到時間].filter(Boolean).join('｜'));
  revalidatePath(`/events/${eventId}/description`);
  return { message: '已儲存' };
}

/** 報名頁內容：各課程分組卡片的對象與內容（表單以序號對應分組名稱） */
export async function saveCoursePanels(eventId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const s = (k: string) => String(formData.get(k) ?? '').trim().slice(0, 200);
  const panels = parseCoursePanels(event.分組說明);
  const count = Math.min(Number(s('panelCount')) || 0, 50);
  for (let i = 0; i < count; i++) {
    const group = s(`panelGroup-${i}`);
    if (group) panels[group] = { 對象: s(`panelAudience-${i}`), 內容: s(`panelContent-${i}`) };
  }
  await events().ensure();
  await events().updateByIds([{ id: eventId, changes: { 分組說明: JSON.stringify(panels) } }]);
  await writeLog(event.活動ID, session, '更新課程分組說明', eventId);
  revalidatePath(`/events/${eventId}/description`);
  return { message: '已儲存' };
}

/** 活動說明分頁：只更新活動說明（家長報名頁顯示的內容），回傳消毒後的 HTML 讓畫面與資料庫一致 */
export async function saveEventDescription(eventId: string, html: string): Promise<{ error?: string; html?: string }> {
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const clean = sanitizeRichText(html);
  await events().updateByIds([{ id: eventId, changes: { 活動說明: clean } }]);
  await writeLog(event.活動ID, session, '更新活動說明', eventId);
  revalidatePath(`/events/${eventId}/description`);
  return { html: clean };
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
