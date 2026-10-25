import { notFound } from 'next/navigation';
import { QrLookup } from '@/components/QrLookup';
import { getEvent } from '@/lib/events';
import { BackLink } from '@/components/BackLink';
import { maskPhone, verifiedFamilyId } from '@/lib/family-auth';
import { households } from '@/lib/tables';

export default async function QrPage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  if (!event) notFound();
  // 這台裝置記住的家庭可直接查詢
  const familyId = verifiedFamilyId();
  const family = familyId ? (await households().all()).find((h) => h.家庭ID === familyId) : undefined;
  return (
    <>
      <BackLink eventId={params.eventId} />
      <h1 className="text-xl font-bold">{event.名稱}｜報到 QR code</h1>
      <QrLookup eventId={event.活動ID} remembered={family ? { name: family.主要聯絡人, phone: maskPhone(family.電話) } : undefined} />
    </>
  );
}
