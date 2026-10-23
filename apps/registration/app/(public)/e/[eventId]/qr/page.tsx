import { notFound } from 'next/navigation';
import { QrLookup } from '@/components/QrLookup';
import { getEvent } from '@/lib/events';

export default async function QrPage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  if (!event) notFound();
  return (
    <>
      <h1 className="text-xl font-bold">{event.名稱}｜報到 QR code</h1>
      <QrLookup eventId={event.活動ID} />
    </>
  );
}
