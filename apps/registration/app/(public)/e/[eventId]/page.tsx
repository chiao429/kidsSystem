import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert, Card } from '@kids/ui';
import { RichText, sanitizeRichText } from '@kids/ui/rich-text';
import { availableCourses } from '@/lib/eligibility';
import { getEvent, registrationWindow } from '@/lib/events';
import { FitTitle } from '@/components/FitTitle';
import { groups } from '@/lib/tables';

export default async function EventPage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  if (!event) notFound();
  const w = registrationWindow(event);
  const r = event.rules;
  const courses = availableCourses(r, await groups(event.活動ID).all());
  const hasDescription = !!sanitizeRichText(event.活動說明);
  const gradeText =
    r.minGrade || r.maxGrade ? `${r.minGrade ?? '不限'} ~ ${r.maxGrade ?? '不限'}` : '不限';
  return (
    <>
      {/* 主視覺：大標題＋兩個報名入口，活動說明放在下方 */}
      <section className="rb-hero">
        <FitTitle className="rb-hero-title">{event.名稱}</FitTitle>
        <p className="rb-hero-sub">
          {event.開始日期}
          {event.結束日期 && event.結束日期 !== event.開始日期 && ` ~ ${event.結束日期}`}
          {event.地點 && `　${event.地點}`}
        </p>
      </section>
      {w.open ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {!r.existingOnly && (
            <Link href={`/e/${event.活動ID}/new`} className="rb-cta rb-cta-orange">
              <span>
                第一次報名
                <span className="block text-sm font-semibold opacity-90">填寫家庭與孩子資料</span>
              </span>
              <span className="rb-cta-arrow" aria-hidden>→</span>
            </Link>
          )}
          <Link href={`/e/${event.活動ID}/returning`} className="rb-cta rb-cta-pink">
            <span>
              曾經報名過
              <span className="block text-sm font-semibold opacity-90">以手機號碼查詢</span>
            </span>
            <span className="rb-cta-arrow" aria-hidden>→</span>
          </Link>
        </div>
      ) : (
        <Alert tone="amber">{w.reason}</Alert>
      )}
      <p className="text-center text-sm">
        <Link href={`/e/${event.活動ID}/qr`} className="rb-link">
          已經報名了？以手機號碼查詢報到 QR code
        </Link>
      </p>
      <Card>
        {/* 有活動說明時只顯示說明（由後台自行排版）；沒有說明的舊活動才列出基本資料 */}
        {!hasDescription && (
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
            <dt className="text-gray-500">日期</dt>
            <dd>
              {event.開始日期}
              {event.結束日期 && event.結束日期 !== event.開始日期 && ` ~ ${event.結束日期}`}
            </dd>
            {event.活動時間 && <><dt className="text-gray-500">時間</dt><dd>{event.活動時間}</dd></>}
            {event.地點 && <><dt className="text-gray-500">地點</dt><dd>{event.地點}</dd></>}
            {event.適用對象 && <><dt className="text-gray-500">適用對象</dt><dd>{event.適用對象}</dd></>}
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
        )}
        {event.備註 && <p className="mt-3 whitespace-pre-line text-sm text-gray-700">{event.備註}</p>}
        <RichText html={event.活動說明} />
        {event.報名提醒 && <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-800">提醒：{event.報名提醒}</p>}
      </Card>
    </>
  );
}
