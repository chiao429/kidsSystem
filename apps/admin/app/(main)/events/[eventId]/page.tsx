import { Card } from '@kids/ui';
import { SubmitButton } from '@kids/ui/client';
import { EVENT_TABLES } from '@kids/schema';
import { EventForm } from '@/components/EventForm';
import { initEventSheet, updateEvent } from '@/lib/event-actions';
import { getEvent } from '@/lib/events';

export default async function EventSettingsPage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  return (
    <>
      <Card title="活動設定">
        <EventForm action={updateEvent.bind(null, params.eventId)} event={event} rules={event.rules} />
      </Card>
      <Card title="活動試算表分頁">
        <p className="mb-3 text-sm text-gray-600">
          建立或檢查：{EVENT_TABLES.map((t) => t.tab).join('、')}。已存在的分頁只會補上缺少的欄位。
        </p>
        <form action={initEventSheet.bind(null, params.eventId)}>
          <SubmitButton variant="secondary">建立 / 檢查分頁</SubmitButton>
        </form>
      </Card>
    </>
  );
}
