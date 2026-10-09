import { Card } from '@kids/ui';
import { requireSession } from '@kids/auth/next';
import { EventForm } from '@/components/EventForm';
import { createEvent } from '@/lib/event-actions';
import { events } from '@/lib/tables';

/** kids＋台北時間今天日期（例如 kids10-09）；當天已有同名活動時加上 -2、-3… */
async function defaultEventId(): Promise<string> {
  const mmdd = new Date(Date.now() + 8 * 3600_000).toISOString().slice(5, 10);
  const base = `kids${mmdd}`;
  const taken = new Set((await events().all()).map((e) => e.活動ID));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export default async function NewEventPage() {
  requireSession({ roles: ['admin'] });
  return (
    <Card title="新增活動">
      <EventForm action={createEvent} defaultId={await defaultEventId()} />
    </Card>
  );
}
