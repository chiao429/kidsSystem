import { migrate } from '@kids/sheets-core/migrate';
import { checkBearer, requireMongo } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = checkBearer(req, 'MIGRATE_TOKEN');
  if (denied) return denied;
  let body: { source?: string; eventIds?: unknown; apply?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  const source = body.source === 'local' ? 'local' : body.source === 'sheets' ? 'sheets' : null;
  if (!source) return Response.json({ error: 'source 必須是 sheets 或 local' }, { status: 400 });
  const apply = body.apply === true;
  if (apply) {
    const notMongo = requireMongo();
    if (notMongo) return notMongo;
  }
  const eventIds = Array.isArray(body.eventIds) ? body.eventIds.map(String).filter(Boolean) : undefined;
  try {
    return Response.json(await migrate({ source, eventIds, apply }));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
