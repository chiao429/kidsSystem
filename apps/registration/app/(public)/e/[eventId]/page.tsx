import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Alert } from '@kids/ui';
import { courseGroupNames, parseCoursePanels } from '@kids/schema';
import { sanitizeRichText } from '@kids/ui/rich-text';
import { availableCourses } from '@/lib/eligibility';
import { eventDateLabel, eventSignatureHtml, getEvent, registrationWindow } from '@/lib/events';
import { groupColor } from '@/lib/course-colors';
import { CoursePanelCard, EventInfoCard, SignatureCard, SupplementCard } from '@/components/EventCards';
import { GuidedTour, type TourStep } from '@/components/GuidedTour';
import { FitTitle } from '@/components/FitTitle';
import { groups } from '@/lib/tables';

export default async function EventPage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  if (!event) notFound();
  const w = registrationWindow(event);
  const r = event.rules;
  const [courses, signature] = await Promise.all([groups(event.活動ID).all().then((g) => availableCourses(r, g)), eventSignatureHtml(event)]);
  const dateRange = `${event.開始日期}${event.結束日期 && event.結束日期 !== event.開始日期 ? ` ~ ${event.結束日期}` : ''}`;
  const infoRows = [
    // 還沒設定「時間與地點」的舊活動，時間這一行改顯示活動日期
    { icon: '🕘', label: '時間', text: event.活動時間 || dateRange },
    { icon: '📍', label: '地點', text: event.地點 },
    { icon: '💳', label: '報到／繳費', text: event.報到時間 },
  ].filter((row) => row.text);
  // 課程分組卡片：依課程的「課程分組」產生，標題日期與活動資訊共用
  const panelNames = courseGroupNames(courses);
  const panels = parseCoursePanels(event.分組說明);
  const panelDate = eventDateLabel(event);
  // 報名教學：依序標示頁面上的區塊；報名沒開放時略過報名入口
  const tourSteps: TourStep[] = [
    { target: 'info', title: '先看活動資訊', text: '這裡是活動的時間、地點，以及報到與繳費時間。' },
    { target: 'courses', title: '認識課程', text: '每個分組適合的年齡與內容，以及各課程的名額與注意事項。報名時會依孩子的年級列出可以選的課程。' },
    ...(w.open
      ? [
          ...(!r.existingOnly
            ? [{ target: 'first', title: '第一次參加：初次報名', text: '填寫家長與孩子的資料、幫孩子選課程，最後設定 4 位數 PIN，下次報名就能直接帶入資料。' }]
            : []),
          { target: 'login', title: '報名過的家長：家長登入', text: '輸入手機＋PIN 帶入家長與孩子的資料，勾選這次要報名的孩子就好。忘記 PIN 可以用孩子的全名＋生日重設。' },
        ]
      : []),
    { target: 'qr', title: '報名完成後：報到 QR code', text: '報名完成會拿到報到 QR code，活動當天出示就能快速報到；找不到時可以在這裡用手機＋PIN 查詢。' },
  ];
  return (
    <>
      {/* 主視覺：大標題＋報名教學；下方依序為活動資訊、課程分組、補充資訊、簽名檔，報名入口懸浮在右下角 */}
      <section className="rb-hero">
        <FitTitle className="rb-hero-title">{event.名稱}</FitTitle>
        <p className="rb-hero-sub">
          {event.開始日期}
          {event.結束日期 && event.結束日期 !== event.開始日期 && ` ~ ${event.結束日期}`}
        </p>
        <GuidedTour steps={tourSteps} />
      </section>
      {!w.open && <Alert tone="amber">{w.reason}</Alert>}
      <p className="text-center text-sm">
        <Link href={`/e/${event.活動ID}/qr`} className="rb-link" data-tour="qr">
          已經報名了？用手機＋PIN 查詢報到 QR code
        </Link>
      </p>
      <div data-tour="info">
        <EventInfoCard rows={infoRows} />
      </div>
      {panelNames.map((name, i) => (
        <CoursePanelCard
          tourTarget={i === 0 ? 'courses' : undefined}
          key={name}
          title={`${panelDate}${name}`}
          color={groupColor(panelNames, name)}
          text={panels[name]}
          courses={courses.filter((c) => (c.課程分組?.trim() || '課程') === name)}
        />
      ))}
      <SupplementCard html={event.活動說明} show={!!sanitizeRichText(event.活動說明)} />
      <SignatureCard html={signature} show={!!sanitizeRichText(signature)} />
      {/* 兩個報名入口上下排列、固定懸浮在右下角；預留底部空間避免蓋住最後的內容 */}
      {w.open && (
        <>
          <div className="h-24" aria-hidden />
          <nav id="register" aria-label="報名" className="rb-cta-bar">
            {!r.existingOnly && (
              <Link href={`/e/${event.活動ID}/new`} className="rb-cta rb-cta-orange" data-tour="first">
                初次報名
                <span className="rb-cta-arrow" aria-hidden>
                  →
                </span>
              </Link>
            )}
            <Link href={`/e/${event.活動ID}/returning`} className="rb-cta rb-cta-pink" data-tour="login">
              家長登入
              <span className="rb-cta-arrow" aria-hidden>
                →
              </span>
            </Link>
          </nav>
        </>
      )}
    </>
  );
}
