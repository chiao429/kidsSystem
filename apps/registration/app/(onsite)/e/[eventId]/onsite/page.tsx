import { notFound, redirect } from 'next/navigation';
import { OnsiteFlow } from '@/components/OnsiteFlow';
import { getEvent } from '@kids/registration-core/lib/events';
import { formProps } from '@kids/registration-core/lib/form-props';
import { isStaff } from '@kids/registration-core/lib/family-auth';

/** 報到系統「＋ 現場報名」進來的頁面：限同工使用，報名完成後回到報到系統直接報到 */
export default async function OnsitePage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  if (!event) notFound();
  if (!isStaff()) redirect(`/login?next=${encodeURIComponent(`/e/${params.eventId}/onsite`)}`);
  return (
    <>
      <a href={`/checkin/e/${params.eventId}`} className="rb-back">
        <span aria-hidden>←</span> 回報到
      </a>
      <h1 className="text-xl font-bold">
        {event.名稱}｜<span className="text-amber-600">現場報名</span>
      </h1>
      <OnsiteFlow formProps={await formProps(event)} />
    </>
  );
}
