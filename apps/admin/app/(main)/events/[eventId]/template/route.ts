import * as XLSX from 'xlsx';
import { requireSession } from '@kids/auth/next';
import { buildTemplate } from '@/lib/event-template';
import { templateToWorkbook, type TemplateData } from '@/lib/template-xlsx';

export const dynamic = 'force-dynamic';

/** 下載活動範本檔（預設 Excel；?format=json 為 JSON），可在「新增活動」匯入，跨環境使用 */
export async function GET(req: Request, { params }: { params: { eventId: string } }) {
  requireSession({ permission: 'admin', eventId: params.eventId });
  const template = await buildTemplate(params.eventId);
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(/-/g, '');
  // 活動名稱常含「10/18」等檔名不能用的字元
  const name = (template.event.名稱 || params.eventId).replace(/[\\/:*?"<>|]/g, '-');
  const json = new URL(req.url).searchParams.get('format') === 'json';
  const body = json
    ? JSON.stringify(template, null, 2)
    : (XLSX.write(templateToWorkbook(template as unknown as TemplateData), { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
  return new Response(body, {
    headers: {
      'Content-Type': json ? 'application/json; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${name}_活動範本_${date}.${json ? 'json' : 'xlsx'}`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
