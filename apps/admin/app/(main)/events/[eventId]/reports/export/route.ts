import { requireSession } from '@kids/auth/next';
import { csvResponse } from '@/lib/csv';
import { getEvent } from '@/lib/events';
import { DATASETS, buildDataset, type DatasetKey } from '@/lib/reports';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { eventId: string } }) {
  requireSession({ permission: 'admin', eventId: params.eventId });
  const url = new URL(req.url);
  const key = url.searchParams.get('dataset') as DatasetKey;
  const def = DATASETS[key];
  if (!def) return new Response('Unknown dataset', { status: 400 });
  const requested = url.searchParams.getAll('col');
  const cols = (def.columns as readonly string[]).filter((c) => requested.length === 0 || requested.includes(c));
  const event = await getEvent(params.eventId);
  const data = await buildDataset(event.活動ID, key, event.名稱);
  return csvResponse([cols, ...data.map((r) => cols.map((c) => r[c] ?? ''))], `${event.名稱}_${def.label}.csv`);
}
