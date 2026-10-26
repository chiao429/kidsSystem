import { buildReport } from '@/lib/report';
import { today } from '@/lib/data';
import { lineGroupId, pushLineText } from '@/lib/line';

export const dynamic = 'force-dynamic';

/**
 * 排程推播（Cloud Scheduler 每週日 11:40 呼叫）：推送今天的小組人數統計到綁定的 LINE 群組。
 * 需帶 Authorization: Bearer <LINE_CRON_TOKEN>。
 */
export async function POST(req: Request) {
  const token = process.env.LINE_CRON_TOKEN;
  if (!token || req.headers.get('authorization') !== `Bearer ${token}`) return new Response('unauthorized', { status: 401 });
  const report = await buildReport(today());
  const res = await pushLineText(await lineGroupId(), report.text);
  if (!res.ok) console.error('[line push]', res.error);
  return Response.json({ ...res, date: report.date }, { status: res.ok ? 200 : 500 });
}
