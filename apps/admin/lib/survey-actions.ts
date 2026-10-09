'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { SurveyStatus, newId, parseQuestions } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { getEvent } from './events';
import { writeLog } from './log';
import { surveys } from './tables';

function readForm(formData: FormData) {
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  const questions = parseQuestions(s('questions'));
  return {
    row: { 標題: s('title'), 題目JSON: JSON.stringify(questions), 對象: s('audience'), 開放: s('open'), 截止: s('close'), 狀態: s('status') },
    questions,
  };
}

export async function saveSurvey(eventId: string, surveyId: string | null, _: FormResult, formData: FormData): Promise<FormResult> {
  const session = requireSession({ roles: ['admin', 'manager'], eventId });
  const event = await getEvent(eventId);
  const { row, questions } = readForm(formData);
  if (!row.標題) return { error: '請填寫問卷標題' };
  if (questions.length === 0) return { error: '至少需要一題' };
  const bad = questions.find((q) => (q.type === 'single' || q.type === 'multi') && (q.options?.length ?? 0) < 2);
  if (bad) return { error: `「${bad.title}」至少需要兩個選項` };
  if (!(Object.values(SurveyStatus) as string[]).includes(row.狀態)) row.狀態 = SurveyStatus.Draft;

  const table = surveys(event.sheetId);
  if (surveyId) {
    await table.updateByIds([{ id: surveyId, changes: row }]);
    await writeLog(event.sheetId, session, '更新問卷', surveyId, row.標題);
    revalidatePath(`/events/${eventId}/surveys/${surveyId}`);
    return { message: '已儲存' };
  }
  const id = newId('問卷ID');
  await table.append([{ 問卷ID: id, ...row }]);
  await writeLog(event.sheetId, session, '建立問卷', id, row.標題);
  redirect(`/events/${eventId}/surveys/${id}`);
}
