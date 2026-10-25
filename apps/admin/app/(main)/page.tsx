import Link from 'next/link';
import { Alert, Badge, Card, Empty, Table, buttonClass, withBase } from '@kids/ui';
import { SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { EventStatus, isArchivedEvent } from '@kids/schema';
import { archiveEvent, purgeEvent, restoreEvent } from '@/lib/event-actions';
import { listEvents, type EventRow } from '@/lib/events';
import { registrations } from '@/lib/tables';

/** 輸入活動ID 才能送出（HTML pattern 驗證；活動ID 只含英數字、- 與 _，不需跳脫）。表格外層可左右捲動，確認框在原地展開而不是浮層，才不會被裁掉 */
function ConfirmById({ id, label, action, danger }: { id: string; label: string; action: (formData: FormData) => Promise<void>; danger?: string }) {
  return (
    <details className="inline-block text-right">
      <summary className={`${buttonClass('ghost', 'sm')} cursor-pointer list-none text-red-600`}>{label}</summary>
      <form action={action} className="mt-2 w-72 space-y-2 whitespace-normal rounded-2xl border border-red-100 bg-red-50/40 p-4 text-left text-sm">
        {danger && <p className="text-gray-700">{danger}</p>}
        <p className="text-gray-600">
          請輸入活動ID <span className="font-mono font-semibold text-gray-900">{id}</span> 確認：
        </p>
        <input name="confirm" required pattern={id} autoComplete="off" className="w-full rounded-xl border border-gray-300 px-3 py-2 font-mono" />
        <SubmitButton variant="danger" size="sm" className="w-full">
          確認{label}
        </SubmitButton>
      </form>
    </details>
  );
}

const statusTone = (s: string) => (s === EventStatus.Open ? 'green' : s === EventStatus.Ended || s === EventStatus.Archived ? 'gray' : 'blue');

export default async function HomePage({ searchParams }: { searchParams: { archived?: string } }) {
  const session = requireSession({ permission: 'admin' });
  const canManage = session.scope === 'all';
  const showArchived = searchParams.archived === '1' && canManage;
  let all: EventRow[];
  try {
    all = await listEvents(session);
  } catch (e) {
    return (
      <Alert tone="amber">
        無法讀取活動清單：{e instanceof Error ? e.message : String(e)}。
        {session.permissions.includes('setup') && (
          <>
            {' '}請先到{' '}
            <Link href="/setup" className="underline">
              初始化
            </Link>{' '}
            建立主資料分頁。
          </>
        )}
      </Alert>
    );
  }
  const archivedCount = all.filter(isArchivedEvent).length;
  const rows = all.filter((e) => isArchivedEvent(e) === showArchived);
  // 已封存的活動才需要知道有沒有報名（決定能不能永久刪除）
  const regCounts = new Map(
    showArchived ? await Promise.all(rows.map(async (e) => [e.活動ID, (await registrations(e.活動ID).all().catch(() => [])).length] as const)) : [],
  );

  return (
    <Card
      title={showArchived ? '已封存的活動' : '活動'}
      actions={
        canManage && (
          <>
            {showArchived ? (
              <Link href="/" className={buttonClass('secondary', 'sm')}>
                返回活動
              </Link>
            ) : (
              archivedCount > 0 && (
                <Link href="/?archived=1" className={buttonClass('ghost', 'sm')}>
                  已封存（{archivedCount}）
                </Link>
              )
            )}
            {!showArchived && (
              <Link href="/events/new" className={buttonClass('primary', 'sm')}>
                新增活動
              </Link>
            )}
          </>
        )
      }
    >
      {showArchived && <p className="mb-3 text-sm text-gray-600">封存的活動不會出現在家長端與報到、點名系統，資料都還保留，可以隨時還原。</p>}
      {rows.length === 0 ? (
        <Empty>{showArchived ? '沒有已封存的活動。' : '還沒有活動。admin 請先到「初始化」建立主資料分頁，再新增活動。'}</Empty>
      ) : (
        <Table head={['名稱', '日期', '狀態', '']}>
          {rows.map((e) => (
            <tr key={e.活動ID}>
              <td className="px-2 py-2">
                <div className="font-medium">{e.名稱}</div>
                <div className="font-mono text-xs text-gray-500">{e.活動ID}</div>
              </td>
              <td className="px-2 py-2 text-gray-600">
                {e.開始日期}
                {e.結束日期 && e.結束日期 !== e.開始日期 ? ` ~ ${e.結束日期}` : ''}
              </td>
              <td className="px-2 py-2">
                <Badge tone={statusTone(e.狀態)}>{e.狀態 || EventStatus.Draft}</Badge>
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right">
                {showArchived ? (
                  <div className="flex items-start justify-end gap-1">
                    <form action={restoreEvent.bind(null, e.活動ID)}>
                      <SubmitButton variant="secondary" size="sm">
                        還原
                      </SubmitButton>
                    </form>
                    {regCounts.get(e.活動ID) === 0 ? (
                      <ConfirmById id={e.活動ID} label="永久刪除" action={purgeEvent.bind(null, e.活動ID)} danger="永久刪除後無法復原。" />
                    ) : (
                      <span className="px-2 text-xs text-gray-400" title="有報名資料的活動只能封存，不能永久刪除">
                        有 {regCounts.get(e.活動ID)} 筆報名
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start justify-end gap-1">
                    <Link href={`/events/${e.活動ID}`} className={buttonClass('secondary', 'sm')}>
                      管理
                    </Link>
                    {canManage && (
                      <Link href={`/events/new?from=${e.活動ID}`} className={buttonClass('ghost', 'sm')}>
                        複製
                      </Link>
                    )}
                    {/* 下載活動範本檔（JSON），在「新增活動」可匯入；原生 <a> 要加 basePath */}
                    <a href={withBase(`/events/${e.活動ID}/template`)} download className={buttonClass('ghost', 'sm')}>
                      匯出範本
                    </a>
                    {canManage && (
                      <ConfirmById id={e.活動ID} label="刪除" action={archiveEvent.bind(null, e.活動ID)} danger="刪除後會移到「已封存」，報名資料都會保留，可以再還原。" />
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
