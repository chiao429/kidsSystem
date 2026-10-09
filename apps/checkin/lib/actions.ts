'use server';

import { requireSession } from '@kids/auth/next';
import {
  CheckInMethod,
  CheckInStatus,
  RegistrationStatus,
  RegistrationType,
  newId,
  nowString,
  splitList,
} from '@kids/schema';
import { checkInKey, loadBoard, loadSlots } from './board';
import { getEvent } from './events';
import { checkIns, logs, members, registrations } from './tables';
import type { ActionResult, Board, SlotInfo } from './types';

const ROLES = ['admin', 'manager', 'staff'] as const;

function session(eventId: string) {
  return requireSession({ roles: [...ROLES], eventId });
}

export async function fetchBoard(eventId: string, course = ''): Promise<Board> {
  session(eventId);
  return loadBoard(eventId, course);
}

export async function fetchSlots(eventId: string): Promise<SlotInfo[]> {
  session(eventId);
  return loadSlots(eventId);
}

async function log(sheetId: string, operator: string, 動作: string, 對象ID: string, 內容 = '') {
  try {
    await logs(sheetId).append([{ 日誌ID: newId('日誌ID'), 時間: nowString(), 系統: 'checkin', 操作者: operator, 動作, 對象ID, 內容 }]);
  } catch (e) {
    console.error('寫入日誌失敗', e);
  }
}

/** 依（報名ID, 課程）新增或更新一列報到紀錄 */
async function upsert(sheetId: string, 報名ID: string, 課程: string, changes: Record<string, string>, base: Record<string, string>) {
  const table = checkIns(sheetId);
  const rows = await table.all({ fresh: true });
  const row = rows.find((r) => checkInKey(r.報名ID, r.課程) === checkInKey(報名ID, 課程));
  if (row) {
    await table.updateByIds([{ id: row.報到ID, changes }]);
    return row;
  }
  await table.append([{ 報到ID: newId('報到ID'), 報名ID, 課程, ...base, ...changes }]);
  return null;
}

export async function checkIn(
  eventId: string,
  input: { 報名ID: string; course?: string; method?: string; force?: boolean; 特殊需求?: string },
): Promise<ActionResult> {
  const s = session(eventId);
  const event = await getEvent(eventId);
  const course = input.course ?? '';
  const reg = (await registrations(event.sheetId).all()).find((r) => r.報名ID === input.報名ID.trim());
  if (!reg) return { error: '找不到此報名資料' };
  if (reg.狀態 === RegistrationStatus.Cancelled) return { error: `${reg.姓名} 的報名已取消` };
  if (course && !splitList(reg.課程).includes(course)) {
    if (!input.force) return { confirm: `${reg.姓名} 沒有報名「${course}」，仍要報到嗎？` };
  }
  if (reg.狀態 !== RegistrationStatus.Accepted && !input.force) {
    return { confirm: `${reg.姓名} 的報名狀態為「${reg.狀態}」，仍要報到嗎？` };
  }

  const existing = (await checkIns(event.sheetId).all({ fresh: true })).find(
    (c) => checkInKey(c.報名ID, c.課程) === checkInKey(reg.報名ID, course),
  );
  if (existing?.狀態 === CheckInStatus.Arrived) {
    return { ok: true, message: `${reg.姓名} 已於 ${existing.報到時間} 報到過` };
  }

  // 第一次報到補資料
  if (input.特殊需求 !== undefined && reg.報名類型 === RegistrationType.FirstTime) {
    await members().updateByIds([{ id: reg.成員ID, changes: { 特殊需求: input.特殊需求.trim().slice(0, 200), 更新時間: nowString() } }]);
  }

  const now = nowString();
  await upsert(
    event.sheetId,
    reg.報名ID,
    course,
    { 狀態: CheckInStatus.Arrived, 報到時間: now, 方式: input.method || CheckInMethod.Search, 操作者: s.name },
    { 成員ID: reg.成員ID, 姓名: reg.姓名, 晚到: '', 已聯繫: '' },
  );
  await log(event.sheetId, s.name, course ? `課程報到：${course}` : '報到', reg.報名ID, reg.姓名);
  return { ok: true, message: `${reg.姓名} 報到成功` };
}

/** 取消報到 / 標記不會出席 / 清除 */
export async function setStatus(eventId: string, 報名ID: string, course: string, status: string): Promise<ActionResult> {
  const s = session(eventId);
  if (![CheckInStatus.Cancelled, CheckInStatus.Absent, ''].includes(status as never)) return { error: '無效的狀態' };
  const event = await getEvent(eventId);
  const reg = (await registrations(event.sheetId).all()).find((r) => r.報名ID === 報名ID);
  if (!reg) return { error: '找不到此報名資料' };
  await upsert(
    event.sheetId,
    報名ID,
    course,
    { 狀態: status, 報到時間: '', 操作者: s.name },
    { 成員ID: reg.成員ID, 姓名: reg.姓名, 方式: '', 晚到: '', 已聯繫: '' },
  );
  await log(event.sheetId, s.name, status || '清除狀態', 報名ID, reg.姓名);
  return { ok: true };
}

export async function toggleFlag(
  eventId: string,
  報名ID: string,
  course: string,
  flag: '晚到' | '已聯繫',
  value: boolean,
): Promise<ActionResult> {
  const s = session(eventId);
  if (flag !== '晚到' && flag !== '已聯繫') return { error: '無效的欄位' };
  const event = await getEvent(eventId);
  const reg = (await registrations(event.sheetId).all()).find((r) => r.報名ID === 報名ID);
  if (!reg) return { error: '找不到此報名資料' };
  await upsert(
    event.sheetId,
    報名ID,
    course,
    { [flag]: value ? 'Y' : '' },
    { 成員ID: reg.成員ID, 姓名: reg.姓名, 狀態: '', 報到時間: '', 方式: '', 操作者: s.name, 晚到: '', 已聯繫: '' },
  );
  await log(event.sheetId, s.name, `${value ? '標記' : '取消'}${flag}`, 報名ID, reg.姓名);
  return { ok: true };
}
