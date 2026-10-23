import { Badge, Card, Empty, Stat, Table, buttonClass, withBase } from '@kids/ui';
import { GroupType, RegistrationStatus, hasGroupType } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { groupByGrade, loadRoster, siblingText } from '@/lib/roster';

export default async function RosterPage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  searchParams: { group?: string; all?: string };
}) {
  const event = await getEvent(params.eventId);
  const statuses = searchParams.all ? Object.values(RegistrationStatus).filter((s) => s !== '取消') : undefined;
  const kids = await loadRoster(event.活動ID, { statuses });
  const groups = groupByGrade(kids);
  const teamsOn = hasGroupType(event.rules, GroupType.Team);
  const shown = searchParams.group ? groups.filter((g) => g.group === searchParams.group) : groups;
  const base = withBase(`/e/${params.eventId}`);
  const q = (extra: Record<string, string>) =>
    '?' + new URLSearchParams({ ...(searchParams.all ? { all: '1' } : {}), ...extra }).toString();

  return (
    <>
      {!teamsOn && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          此活動未啟用小隊，不需要分隊；課程請到後台「分組」管理。
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="人數" value={kids.length} tone="blue" sub={searchParams.all ? '正取＋備取＋待審核' : '正取'} />
        <Stat label="男 / 女" value={`${kids.filter((k) => k.性別 === '男').length} / ${kids.filter((k) => k.性別 === '女').length}`} />
        <Stat label="有手足同行" value={kids.filter((k) => k.siblings.length > 0).length} tone="purple" />
        <Stat label={teamsOn ? '已分隊' : '已選課'} value={teamsOn ? kids.filter((k) => k.小隊).length : kids.filter((k) => k.課程).length} tone="green" />
      </div>

      <Card
        title="匯出 Excel"
        actions={
          <>
            <a href={`${base}/export/grades${q({})}`} className={buttonClass('primary', 'sm')}>總表＋年級分頁</a>
            {teamsOn && <a href={`${base}/export/teams`} className={buttonClass('secondary', 'sm')}>小隊名單</a>}
            <a href={`${base}/export/notify`} className={buttonClass('secondary', 'sm')}>行前通知總表</a>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          總表依序號排序、手足展開成多列；年級分頁中學齡前（未就學～大班）合併。{teamsOn ? '小隊名單每隊一個分頁。' : '此活動未啟用小隊。'}
        </p>
      </Card>

      <Card
        title="分組"
        actions={
          <a href={searchParams.all ? base : `${base}?all=1`} className="text-sm text-teal-700 underline">
            {searchParams.all ? '只看正取' : '含備取／待審核'}
          </a>
        }
      >
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          <a href={base + q({})} className={buttonClass(searchParams.group ? 'ghost' : 'secondary', 'sm')}>全部</a>
          {groups.map((g) => (
            <a key={g.group} href={base + q({ group: g.group })} className={buttonClass(searchParams.group === g.group ? 'secondary' : 'ghost', 'sm')}>
              {g.group}（{g.kids.length}）
            </a>
          ))}
        </div>
        {kids.length === 0 ? (
          <Empty>沒有報名資料</Empty>
        ) : (
          shown.map((g) => (
            <div key={g.group} className="mb-6">
              <h3 className="mb-2 font-semibold">
                {g.group}　<span className="text-sm font-normal text-gray-500">男 {g.kids.filter((k) => k.性別 === '男').length}・女 {g.kids.filter((k) => k.性別 === '女').length}</span>
              </h3>
              <Table head={['序號', '姓名', '性別', '年級', '學校', '家長', '電話', '手足', '小隊', '特殊需求']}>
                {g.kids.map((k) => (
                  <tr key={k.報名ID}>
                    <td className="px-2 py-1.5 tabular-nums">{k.序號}</td>
                    <td className="px-2 py-1.5 font-medium">
                      {k.姓名} {k.狀態 !== '正取' && <Badge tone="amber">{k.狀態}</Badge>}
                    </td>
                    <td className="px-2 py-1.5">{k.性別}</td>
                    <td className="px-2 py-1.5">{k.年級}</td>
                    <td className="px-2 py-1.5">{k.學校}</td>
                    <td className="px-2 py-1.5">{k.家長}</td>
                    <td className="px-2 py-1.5 tabular-nums">{k.電話}</td>
                    <td className="px-2 py-1.5 text-gray-600">{siblingText(k)}</td>
                    <td className="px-2 py-1.5">{k.小隊}</td>
                    <td className="px-2 py-1.5 text-red-700">{k.特殊需求}</td>
                  </tr>
                ))}
              </Table>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
