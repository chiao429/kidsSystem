'use server';

import { cleanAnswers, newId, normalizePhone, nowString, type Answers } from '@kids/schema';
import { loadSurvey } from './survey-data';
import { households, surveyResponses } from './tables';

export async function submitSurvey(
  eventId: string,
  surveyId: string,
  raw: Answers,
  phone: string,
): Promise<{ error?: string; ok?: boolean }> {
  const data = await loadSurvey(eventId, surveyId);
  if (!data) return { error: '找不到問卷' };
  if (!data.available) return { error: '問卷目前不開放填寫' };
  const { answers, missing } = cleanAnswers(data.questions, raw);
  if (missing.length) return { error: `請回答：${missing.join('、')}` };

  // 選填：用電話對應家庭（只記錄家庭ID，不回傳任何資料）
  const p = normalizePhone(phone);
  const household = p ? (await households().all()).find((h) => normalizePhone(h.電話) === p) : undefined;
  await surveyResponses(data.event.活動ID).append([
    { 回覆ID: newId('回覆ID'), 問卷ID: surveyId, 家庭ID: household?.家庭ID ?? '', 成員ID: '', 答案JSON: JSON.stringify(answers), 時間: nowString() },
  ]);
  return { ok: true };
}
