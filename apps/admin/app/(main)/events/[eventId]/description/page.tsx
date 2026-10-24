import { Alert } from '@kids/ui';
import { EventStatus } from '@kids/schema';
import { DescriptionEditor } from '@/components/DescriptionEditor';
import { getEvent } from '@/lib/events';

export default async function EventDescriptionPage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  return (
    <>
      {event.狀態 !== EventStatus.Open && (
        <Alert tone="blue">目前狀態為「{event.狀態 || EventStatus.Draft}」，預覽家長頁時看得到活動說明，但不會出現報名按鈕；改成「開放報名」後家長才能報名。</Alert>
      )}
      {/* 家長報名頁在統一入口的根路徑（registration），跨系統用原生連結 */}
      <DescriptionEditor eventId={params.eventId} initial={event.活動說明} previewUrl={`/e/${event.活動ID}`} />
    </>
  );
}
