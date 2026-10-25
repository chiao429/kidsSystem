import { requireSession } from '@kids/auth/next';
import { buildTemplate } from '@/lib/event-template';

export const dynamic = 'force-dynamic';

/** 下載活動範本檔（JSON），可在「新增活動」匯入，跨環境使用 */
export async function GET(_req: Request, { params }: { params: { eventId: string } }) {
  requireSession({ permission: 'admin', eventId: params.eventId });
  const template = await buildTemplate(params.eventId);
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(/-/g, '');
  // 活動名稱常含「10/18」等檔名不能用的字元
  const name = (template.event.名稱 || params.eventId).replace(/[\\/:*?"<>|]/g, '-');
  return new Response(JSON.stringify(template, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${name}_活動範本_${date}.json`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
