import { pushDirty } from '@kids/sheets-core/mirror';
import { checkBearer, requireMongo } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = checkBearer(req, 'SYNC_TOKEN') ?? requireMongo();
  if (denied) return denied;
  const maxTables = Number(process.env.SYNC_MAX_TABLES) || 20;
  return Response.json(await pushDirty({ maxTables, timeBudgetMs: 45_000 }));
}
