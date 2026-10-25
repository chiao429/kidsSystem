import { Card } from '@kids/ui';
import { requireSession } from '@kids/auth/next';
import { EventForm } from '@/components/EventForm';
import { NewEventFromTemplate } from '@/components/NewEventFromTemplate';
import { createEvent } from '@/lib/event-actions';
import { getEvent, isSheetRequired } from '@/lib/events';
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

export default async function NewEventPage({ searchParams }: { searchParams: { from?: string } }) {
  requireSession({ permission: 'admin', allEvents: true });
  const source = searchParams.from ? await getEvent(searchParams.from).catch(() => undefined) : undefined;
  return (
    <Card title={source ? `複製活動：${source.名稱}` : '新增活動'}>
      {source && (
        <p className="mb-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-gray-700">
          會一併複製報名頁內容（時間與地點、課程分組說明、補充資訊、簽名檔）、課程、小隊、時間表與問卷；
          報名、報到、點名與問卷回覆不會複製。請確認日期與報名時間後儲存。
        </p>
      )}
      {source ? (
        <EventForm action={createEvent} defaultId={await defaultEventId()} copyFrom={source} rules={source?.rules} sheetRequired={isSheetRequired()} />
      ) : (
        <NewEventFromTemplate action={createEvent} defaultId={await defaultEventId()} sheetRequired={isSheetRequired()} />
      )}
    </Card>
  );
}
