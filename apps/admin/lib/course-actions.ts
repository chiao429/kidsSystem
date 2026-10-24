'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { GroupType, LEARNER_ROLES, newId } from '@kids/schema';
import { cleanCourse, courseFromGroup, validateCourses, type CourseDraft } from './course-fields';
import { getEvent } from './events';
import { writeLog } from './log';
import { groupMembers, groups } from './tables';

export interface CourseSaveInput {
  /** 新增（沒有 id）與修改（有 id）的課程 */
  upserts: { id?: string; draft: CourseDraft }[];
  /** 要刪除的課程分組ID（只限沒有學員的課程） */
  deletes: string[];
}

export interface CourseSaveResult {
  error?: string;
  /** 依 upserts 順序的每列錯誤 */
  rowErrors?: string[][];
  message?: string;
}

/** 課程頁「全部儲存」：一次寫入所有新增、修改與刪除；任何一列有錯就全部不寫入 */
export async function saveCourses(eventId: string, input: CourseSaveInput): Promise<CourseSaveResult> {
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const table = groups(event.活動ID);
  await table.ensure();
  const [all, members] = await Promise.all([table.all({ fresh: true }), groupMembers(event.活動ID).all({ fresh: true })]);
  const courses = all.filter((g) => g.類型 === GroupType.Course);
  const byId = new Map(courses.map((g) => [g.分組ID, g]));

  const deletes = [...new Set(input.deletes)].filter((id) => byId.has(id));
  const blocked = deletes.filter((id) => members.some((m) => m.分組ID === id && LEARNER_ROLES.includes(m.角色)));
  if (blocked.length) return { error: `${blocked.map((id) => byId.get(id)!.名稱).join('、')} 已有學員，不能刪除，請改成「停用」` };

  const upserts = input.upserts.map((u) => ({ id: u.id, draft: cleanCourse(u.draft) }));
  // 名稱重複要連同這次沒動到的課程一起檢查
  const touched = new Set([...deletes, ...upserts.map((u) => u.id).filter(Boolean)]);
  const untouched = courses.filter((g) => !touched.has(g.分組ID));
  const rowErrors = validateCourses([...upserts.map((u) => u.draft), ...untouched.map(courseFromGroup)])
    .slice(0, upserts.length)
    // 編輯期間被別人刪掉的課程（列順序要與前端一致，所以不能直接濾掉）
    .map((errors, i) => (upserts[i].id && !byId.has(upserts[i].id!) ? ['此課程已被刪除，請重新整理頁面', ...errors] : errors));
  if (rowErrors.some((e) => e.length)) return { error: '有課程資料需要修正，請看標示紅字的課程', rowErrors };

  let order = courses.reduce((max, g) => Math.max(max, Number(g.排序) || 0), 0);
  const updates = upserts.filter((u) => u.id).map((u) => ({ id: u.id!, changes: { ...u.draft, 區域: '' } }));
  const appends = upserts
    .filter((u) => !u.id)
    .map((u) => ({ 分組ID: newId('分組ID'), 類型: GroupType.Course, ...u.draft, 區域: '', 排序: u.draft.排序 || String(++order) }));

  if (updates.length) await table.updateByIds(updates);
  if (appends.length) await table.append(appends);
  if (deletes.length) {
    // 刪除課程時一併移除該課程的老師／助教指派
    const leaderRows = members.filter((m) => deletes.includes(m.分組ID)).map((m) => m.分組成員ID);
    if (leaderRows.length) await groupMembers(event.活動ID).deleteByIds(leaderRows);
    await table.deleteByIds(deletes);
  }

  const summary = [appends.length && `新增 ${appends.length}`, updates.length && `修改 ${updates.length}`, deletes.length && `刪除 ${deletes.length}`].filter(Boolean).join('、');
  if (summary) await writeLog(event.活動ID, session, '儲存課程', '', summary);
  revalidatePath(`/events/${eventId}/groups`);
  return { message: summary ? `已儲存：${summary} 筆` : '沒有需要儲存的變更' };
}
