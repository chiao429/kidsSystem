'use server';

import { requireSession } from '@kids/auth/next';
import {
  CheckInMethod,
  CheckInStatus,
  RegistrationStatus,
  RegistrationType,
  newId,
  nowString,
} from '@kids/schema';
import { checkInKey, loadBoard, loadGroups, loadSlots } from './board';
import { getEvent } from './events';
import { checkIns, groupMembers, logs, members, registrations } from './tables';
import type { ActionResult, Board, CheckInOutcome, ScanRow, SlotInfo } from './types';


function session(eventId: string) {
  return requireSession({ permission: 'checkin', eventId });
}

export async function fetchBoard(eventId: string, course = ''): Promise<Board> {
  session(eventId);
  return loadBoard(eventId, course);
}

export async function fetchSlots(eventId: string): Promise<SlotInfo[]> {
  session(eventId);
  return loadSlots(eventId);
}

async function log(eventId: string, operator: string, 動作: string, 對象ID: string, 內容 = '') {
  try {
    await logs(eventId).append([{ 日誌ID: newId('日誌ID'), 時間: nowString(), 系統: 'checkin', 操作者: operator, 動作, 對象ID, 內容 }]);
  } catch (e) {
    console.error('寫入日誌失敗', e);
  }
}

/** 依（報名ID, 分組ID）新增或更新一列報到紀錄；唯一索引保證兩台裝置同時操作也只有一列 */
async function upsert(eventId: string, 報名ID: string, 分組ID: string, changes: Record<string, string>, base: Record<string, string>) {
  return checkIns(eventId).upsertByKey(['報名ID', '分組ID'], { 報到ID: newId('報到ID'), 報名ID, 分組ID, ...base, ...changes }, changes);
}

async function courseName(eventId: string, 分組ID: string) {
  return (await loadGroups(eventId)).groups.find((g) => g.分組ID === 分組ID)?.名稱 ?? 分組ID;
}

export async function checkIn(
  eventId: string,
  input: { 報名ID: string; course?: string; method?: string; force?: boolean; 特殊需求?: string },
): Promise<ActionResult> {
  const s = session(eventId);
  const event = await getEvent(eventId);
  const course = input.course ?? '';
  const reg = (await registrations(event.活動ID).all()).find((r) => r.報名ID === input.報名ID.trim());
  if (!reg) return { error: '找不到此報名資料' };
  if (reg.狀態 === RegistrationStatus.Cancelled) return { error: `${reg.姓名} 的報名已取消` };
  if (course) {
    const enrolled = (await groupMembers(event.活動ID).all()).some(
      (m) => m.分組ID === course && (m.報名ID === reg.報名ID || m.成員ID === reg.成員ID),
    );
    if (!enrolled && !input.force) return { confirm: `${reg.姓名} 沒有報名「${await courseName(event.活動ID, course)}」，仍要報到嗎？` };
  }
  if (reg.狀態 !== RegistrationStatus.Accepted && !input.force) {
    return { confirm: `${reg.姓名} 的報名狀態為「${reg.狀態}」，仍要報到嗎？` };
  }

  const existing = (await checkIns(event.活動ID).all({ fresh: true })).find(
    (c) => checkInKey(c.報名ID, c.分組ID) === checkInKey(reg.報名ID, course),
  );
  if (existing?.狀態 === CheckInStatus.Absent) {
    return { error: `${reg.姓名} 已標記「不會出席」，如要報到請先按「恢復」` };
  }
  if (existing?.狀態 === CheckInStatus.Arrived) {
    return { ok: true, already: true, message: `${reg.姓名} 已於 ${existing.報到時間.split(' ')[1]?.slice(0, 5) ?? existing.報到時間} 報到過` };
  }

  // 第一次報到補資料
  if (input.特殊需求 !== undefined && reg.報名類型 === RegistrationType.FirstTime) {
    await members().updateByIds([{ id: reg.成員ID, changes: { 特殊需求: input.特殊需求.trim().slice(0, 200), 更新時間: nowString() } }]);
  }

  const now = nowString();
  await upsert(
    event.活動ID,
    reg.報名ID,
    course,
    { 狀態: CheckInStatus.Arrived, 報到時間: now, 方式: input.method || CheckInMethod.Search, 操作者: s.name },
    { 成員ID: reg.成員ID, 姓名: reg.姓名, 晚到: '', 已聯繫: '' },
  );
  await log(event.活動ID, s.name, course ? `課程報到：${await courseName(event.活動ID, course)}` : '報到', reg.報名ID, reg.姓名);
  return { ok: true, message: `${reg.姓名} 報到成功` };
}

/**
 * 掃描或點選：找出要處理的孩子。
 * code 為報名ID（個人 QR）或家庭ID（家庭 QR：本活動此家庭所有有效報名）。
 * 課程報到時，沒有報名此課程的家人也會列出（enrolled = false），但不能報到。
 */
export async function lookupScan(eventId: string, code: string, course = ''): Promise<{ error?: string; rows?: ScanRow[] }> {
  session(eventId);
  const id = code.trim();
  const all = await loadBoard(eventId, '');
  const picked = all.rows.filter((r) => r.報名ID === id || r.家庭ID === id);
  if (picked.length === 0) return { error: `查無此 QR Code：${id}` };
  if (!course) return { rows: picked.map((r) => ({ ...r, enrolled: true })) };
  const courseRows = new Map((await loadBoard(eventId, course)).rows.map((r) => [r.報名ID, r]));
  return { rows: picked.map((r) => ({ ...(courseRows.get(r.報名ID) ?? r), enrolled: courseRows.has(r.報名ID) })) };
}

/** 一次幫多位孩子報到（已在確認視窗確認過備取、第一次報名等情況） */
export async function checkInMany(
  eventId: string,
  course: string,
  method: string,
  items: { 報名ID: string; 特殊需求?: string }[],
): Promise<CheckInOutcome[]> {
  session(eventId);
  const out: CheckInOutcome[] = [];
  for (const item of items.slice(0, 20)) {
    const res = await checkIn(eventId, { ...item, course, method, force: true });
    out.push({
      報名ID: item.報名ID,
      status: res.error ? 'error' : res.already ? 'already' : 'done',
      message: res.error ?? res.message ?? '',
    });
  }
  return out;
}

/** 取消報到 / 標記不會出席 / 清除 */
export async function setStatus(eventId: string, 報名ID: string, course: string, status: string): Promise<ActionResult> {
  const s = session(eventId);
  if (![CheckInStatus.Cancelled, CheckInStatus.Absent, ''].includes(status as never)) return { error: '無效的狀態' };
  const event = await getEvent(eventId);
  const reg = (await registrations(event.活動ID).all()).find((r) => r.報名ID === 報名ID);
  if (!reg) return { error: '找不到此報名資料' };
  await upsert(
    event.活動ID,
    報名ID,
    course,
    { 狀態: status, 報到時間: '', 操作者: s.name },
    { 成員ID: reg.成員ID, 姓名: reg.姓名, 方式: '', 晚到: '', 已聯繫: '' },
  );
  await log(event.活動ID, s.name, status || '清除狀態', 報名ID, reg.姓名);
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
  const reg = (await registrations(event.活動ID).all()).find((r) => r.報名ID === 報名ID);
  if (!reg) return { error: '找不到此報名資料' };
  await upsert(
    event.活動ID,
    報名ID,
    course,
    { [flag]: value ? 'Y' : '' },
    { 成員ID: reg.成員ID, 姓名: reg.姓名, 狀態: '', 報到時間: '', 方式: '', 操作者: s.name, 晚到: '', 已聯繫: '' },
  );
  await log(event.活動ID, s.name, `${value ? '標記' : '取消'}${flag}`, 報名ID, reg.姓名);
  return { ok: true };
}
