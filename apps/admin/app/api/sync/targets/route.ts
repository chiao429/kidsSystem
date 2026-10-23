import { editableColumns, syncTargets } from '@kids/sheets-core/mirror';
import { checkBearer, requireMongo } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = checkBearer(req, 'SYNC_TOKEN') ?? requireMongo();
  if (denied) return denied;
  return Response.json({ ...(await syncTargets()), tables: editableColumns() });
}
