import { requireSession } from '@kids/auth/next';
import { GroupType, hasGroupType, isArchivedEvent } from '@kids/schema';
import { Alert, Badge, buttonClass } from '@kids/ui';
import { getEvent } from '@/lib/events';
import { EventTabs } from '@/components/EventTabs';

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: { eventId: string } }) {
  requireSession({ permission: 'admin', eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const base = `/events/${params.eventId}`;
  const tabs = [
    ['', '設定'],
    ['/description', '報名頁內容'],
    ['/groups', '課程'],
    // 小隊與課程分開：啟用小隊時才出現
    ...(hasGroupType(event.rules, GroupType.Team) ? [['/teams', '小隊']] : []),
    ['/registrations', '報名'],
    ['/logs', '日誌'],
  ];
  // 較少用到的功能收進「更多」；小隊相關分頁只在啟用小隊時出現
  const more = [
    ...(hasGroupType(event.rules, GroupType.Team) ? [['/schedule', '時間表']] : []),
    ['/surveys', '問卷'],
    ['/reports', '報表'],
  ];
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm text-gray-500">{event.活動ID}</div>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
              {event.名稱}
              {isArchivedEvent(event) && <Badge tone="gray">已封存</Badge>}
            </h1>
          </div>
          {/* 家長端活動頁（報名系統，統一入口的根路徑），開新分頁；草稿或截止時看得到內容但沒有報名按鈕 */}
          {!isArchivedEvent(event) && (
            <a href={`/e/${event.活動ID}`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
              預覽家長頁 ↗
            </a>
          )}
        </div>
        {event.sheetId && event.活動試算表.startsWith('http') && (
          <a href={event.活動試算表} target="_blank" rel="noreferrer" className="text-sm text-[#315bc7] underline">
            開啟活動試算表
          </a>
        )}
      </div>
      {isArchivedEvent(event) && <Alert tone="amber">此活動已封存，家長端與報到、點名系統都看不到。要恢復請到活動清單的「已封存」按「還原」。</Alert>}
      <EventTabs base={base} tabs={tabs} more={more} />
      {children}
    </div>
  );
}
