import Link from 'next/link';
import { Alert, Badge, Card, Empty, Table, buttonClass } from '@kids/ui';
import { requireSession } from '@kids/auth/next';
import { listEvents } from '@/lib/events';

export default async function HomePage() {
  const session = requireSession({ permission: 'admin' });
  let rows;
  try {
    rows = await listEvents(session);
  } catch (e) {
    return (
      <Alert tone="amber">
        無法讀取活動清單：{e instanceof Error ? e.message : String(e)}。
        {session.permissions.includes('accounts') && (
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
  return (
    <Card
      title="活動"
      actions={
        session.scope === 'all' && (
          <Link href="/events/new" className={buttonClass('primary', 'sm')}>
            新增活動
          </Link>
        )
      }
    >
      {rows.length === 0 ? (
        <Empty>還沒有活動。admin 請先到「初始化」建立主資料分頁，再新增活動。</Empty>
      ) : (
        <Table head={['活動ID', '名稱', '版本', '日期', '狀態', '']}>
          {rows.map((e) => (
            <tr key={e.活動ID}>
              <td className="px-2 py-2 font-mono text-xs">{e.活動ID}</td>
              <td className="px-2 py-2 font-medium">{e.名稱}</td>
              <td className="px-2 py-2">{e.版本}</td>
              <td className="px-2 py-2 text-gray-600">
                {e.開始日期}
                {e.結束日期 && e.結束日期 !== e.開始日期 ? ` ~ ${e.結束日期}` : ''}
              </td>
              <td className="px-2 py-2">
                <Badge tone={e.狀態 === '開放報名' ? 'green' : e.狀態 === '已結束' ? 'gray' : 'blue'}>{e.狀態 || '草稿'}</Badge>
              </td>
              <td className="px-2 py-2 text-right">
                <Link href={`/events/${e.活動ID}`} className={buttonClass('secondary', 'sm')}>
                  管理
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
