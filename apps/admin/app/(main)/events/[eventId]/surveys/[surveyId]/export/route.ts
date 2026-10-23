import { requireSession } from '@kids/auth/next';
import { parseQuestions, type Answers } from '@kids/schema';
import { csvResponse } from '@/lib/csv';
import { getEvent } from '@/lib/events';
import { surveyResponses, surveys } from '@/lib/tables';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { eventId: string; surveyId: string } }) {
  requireSession({ roles: ['admin', 'manager'], eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const survey = await surveys(event.活動ID).findById(params.surveyId);
  if (!survey) return new Response('Not found', { status: 404 });
  const questions = parseQuestions(survey.題目JSON);
  const rows = (await surveyResponses(event.活動ID).all())
    .filter((r) => r.問卷ID === survey.問卷ID)
    .map((r) => {
      let a: Answers = {};
      try {
        a = JSON.parse(r.答案JSON);
      } catch {
        /* 壞掉的回覆留白 */
      }
      return [r.時間, r.家庭ID, ...questions.map((q) => (Array.isArray(a[q.id]) ? (a[q.id] as string[]).join('、') : a[q.id] ?? ''))];
    });
  return csvResponse([['時間', '家庭ID', ...questions.map((q) => q.title)], ...rows], `${survey.標題}_回覆.csv`);
}
