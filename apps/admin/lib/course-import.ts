'use server';

import { revalidatePath } from 'next/cache';
import { GroupType, newId, type Group } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { getEvent } from './events';
import { writeLog } from './log';
import { groups } from './tables';

export const COURSE_IMPORT_HEADERS = [
  '課程分組', '適用對象', '課程名稱', '課程代碼', '最低年級', '最高年級', '最低年齡', '最高年齡',
  '名額', '材料費', '課程說明', '注意事項', '報名開始', '報名截止', '允許現場報名', '排序', '狀態',
] as const;

export type CourseImportRow = Record<string, string>;

const clean = (v: unknown) => String(v ?? '').trim();
const number = (v: string, integer = false) => {
  if (!v) return '';
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && (!integer || Number.isInteger(n)) ? String(n) : null;
};
const bool = (v: string) => !['否', 'no', 'n', 'false', '0'].includes(v.trim().toLowerCase());

function normalize(row: CourseImportRow) {
  const get = (...keys: string[]) => keys.map((key) => clean(row[key])).find(Boolean) ?? '';
  return {
    課程分組: get('課程分組'), 適用對象: get('適用對象'), 名稱: get('課程名稱', '名稱'), 代碼: get('課程代碼', '代碼'),
    最低年級: get('最低年級'), 最高年級: get('最高年級'), 最低年齡: get('最低年齡'), 最高年齡: get('最高年齡'),
    名額: get('名額'), 材料費: get('材料費'), 說明: get('課程說明', '說明'), 注意事項: get('注意事項'),
    課程報名開始: get('報名開始'), 課程報名截止: get('報名截止'), 允許現場報名: get('允許現場報名') || '是',
    排序: get('排序'), 狀態: get('狀態') || '啟用',
  };
}

export async function validateCourseRows(rows: CourseImportRow[], existing: Group[]) {
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();
  const errors: string[] = [];
  const preview = rows.map((raw, index) => {
    const row = normalize(raw);
    const line = index + 2;
    const rowErrors: string[] = [];
    if (!row.名稱) rowErrors.push('缺少課程名稱');
    if (row.代碼 && seenCodes.has(row.代碼)) rowErrors.push('檔案內課程代碼重複');
    if (row.名稱 && seenNames.has(row.名稱)) rowErrors.push('檔案內課程名稱重複');
    if (row.代碼) seenCodes.add(row.代碼);
    if (row.名稱) seenNames.add(row.名稱);
    for (const [key, integer] of [['名額', true], ['材料費', true], ['最低年齡', false], ['最高年齡', false]] as const) {
      if (row[key] && number(row[key], integer) === null) rowErrors.push(`${key}必須是非負${integer ? '整數' : '數字'}`);
    }
    if (row.最低年齡 && row.最高年齡 && Number(row.最低年齡) > Number(row.最高年齡)) rowErrors.push('最低年齡不可高於最高年齡');
    if (row.課程報名開始 && row.課程報名截止 && new Date(row.課程報名開始) > new Date(row.課程報名截止)) rowErrors.push('報名截止不可早於開始');
    if (!['啟用', '停用'].includes(row.狀態)) rowErrors.push('狀態必須是啟用或停用');
    const match = existing.find((g) => (row.代碼 && g.代碼 === row.代碼) || (!row.代碼 && g.名稱 === row.名稱));
    if (rowErrors.length) errors.push(`第 ${line} 列「${row.名稱 || '未命名'}」：${rowErrors.join('、')}`);
    return { line, row, action: match ? '更新' : '新增', errors: rowErrors };
  });
  return { preview, errors };
}

export async function previewCourseImport(eventId: string, rows: CourseImportRow[]) {
  requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  return validateCourseRows(rows, await groups(event.活動ID).all({ fresh: true }));
}

export async function applyCourseImport(eventId: string, rows: CourseImportRow[]): Promise<FormResult> {
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const table = groups(event.活動ID);
  const existing = await table.all({ fresh: true });
  const checked = await validateCourseRows(rows, existing);
  if (checked.errors.length) return { error: `匯入資料有錯誤：${checked.errors.join('；')}` };
  let updated = 0;
  let added = 0;
  for (const item of checked.preview) {
    const r = item.row;
    const current = existing.find((g) => (r.代碼 && g.代碼 === r.代碼) || (!r.代碼 && g.名稱 === r.名稱));
    const changes = {
      類型: GroupType.Course,
      名稱: r.名稱, 代碼: r.代碼, 名額: number(r.名額, true) ?? '', 區域: '', 說明: r.說明,
      排序: number(r.排序, true) ?? '', 狀態: r.狀態, 課程分組: r.課程分組, 適用對象: r.適用對象,
      最低年級: r.最低年級, 最高年級: r.最高年級, 最低年齡: number(r.最低年齡) ?? '', 最高年齡: number(r.最高年齡) ?? '',
      材料費: number(r.材料費, true) ?? '', 課程報名開始: r.課程報名開始, 課程報名截止: r.課程報名截止,
      允許現場報名: bool(r.允許現場報名) ? 'Y' : 'N', 注意事項: r.注意事項,
    };
    if (current) {
      await table.updateByIds([{ id: current.分組ID, changes }]);
      updated++;
    } else {
      await table.append([{ 分組ID: newId('分組ID'), ...changes }]);
      added++;
    }
  }
  await writeLog(event.活動ID, session, '匯入課程', '', `新增 ${added}、更新 ${updated} 筆`);
  revalidatePath(`/events/${eventId}/groups`);
  return { message: `匯入完成：新增 ${added}、更新 ${updated} 筆` };
}
