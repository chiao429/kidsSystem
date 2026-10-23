import { applySheetEdit, type SheetEdit } from '@kids/sheets-core/mirror';
import { checkBearer, requireMongo } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? undefined : String(v));

export async function POST(req: Request) {
  const denied = checkBearer(req, 'SYNC_TOKEN') ?? requireMongo();
  if (denied) return denied;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const list = (Array.isArray(body) ? body : [body]).slice(0, 200) as Record<string, unknown>[];
  const results = [];
  for (const e of list) {
    const edit: SheetEdit = {
      spreadsheetId: str(e.spreadsheetId) ?? '',
      tab: str(e.tab) ?? '',
      id: str(e.id) ?? '',
      header: str(e.header) ?? '',
      oldValue: str(e.oldValue),
      newValue: str(e.newValue),
      editor: str(e.editor),
    };
    if (!edit.spreadsheetId || !edit.tab || !edit.id || !edit.header) {
      results.push({ status: 'rejected', reason: '缺少必要欄位' });
      continue;
    }
    results.push(await applySheetEdit(edit));
  }
  return Response.json({ results });
}
