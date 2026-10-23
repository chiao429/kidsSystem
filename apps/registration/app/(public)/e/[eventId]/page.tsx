import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card, buttonClass } from '@kids/ui';
import { availableCourses } from '@/lib/eligibility';
import { getEvent, registrationWindow } from '@/lib/events';
import { groups } from '@/lib/tables';

export default async function EventPage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  if (!event) notFound();
  const w = registrationWindow(event);
  const r = event.rules;
  const courses = availableCourses(r, await groups(event.活動ID).all());
  const gradeText =
    r.minGrade || r.maxGrade ? `${r.minGrade ?? '不限'} ~ ${r.maxGrade ?? '不限'}` : '不限';
  return (
    <>
      <Card title={event.名稱}>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
          <dt className="text-gray-500">日期</dt>
          <dd>
            {event.開始日期}
            {event.結束日期 && event.結束日期 !== event.開始日期 && ` ~ ${event.結束日期}`}
          </dd>
          <dt className="text-gray-500">年級</dt>
          <dd>{gradeText}</dd>
          {courses.length > 0 && (
            <>
              <dt className="text-gray-500">課程</dt>
              <dd>{courses.map((c) => c.名稱).join('、')}</dd>
            </>
          )}
          {event.報名截止 && (
            <>
              <dt className="text-gray-500">報名截止</dt>
              <dd>{event.報名截止.replace('T', ' ')}</dd>
            </>
          )}
        </dl>
        {event.備註 && <p className="mt-3 whitespace-pre-line text-sm text-gray-700">{event.備註}</p>}
      </Card>
      {w.open ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {!r.existingOnly && (
            <Link href={`/e/${event.活動ID}/new`} className={buttonClass('primary', 'lg')}>
              第一次報名
            </Link>
          )}
          <Link href={`/e/${event.活動ID}/returning`} className={buttonClass(r.existingOnly ? 'primary' : 'secondary', 'lg')}>
            曾經報名過（以電話查詢）
          </Link>
        </div>
      ) : (
        <Alert tone="amber">{w.reason}</Alert>
      )}
    </>
  );
}
