import Link from 'next/link';
import { Card, Empty } from '@kids/ui';
import { requireSession } from '@kids/auth/next';
import { BASES } from '@kids/schema';
import { today, visibleGroups } from '@/lib/data';
import { SheetImport } from '@/components/SheetImport';
import { smallGroupAttendance, smallGroupMembers } from '@/lib/tables';

/** 小組列表：依基地（思麥特／夢夢）分開，顯示組員數與今天已點名人數 */
export default async function GroupsPage() {
  const session = requireSession({ permission: 'smallgroups' });
  const groups = await visibleGroups(session);
  const d = today();
  const [mm, aa] = await Promise.all([smallGroupMembers().all(), smallGroupAttendance().all()]);
  const size = (id: string) => mm.filter((m) => m.小組ID === id && !m.離開日期).length;
  const marked = (id: string) => aa.filter((a) => a.小組ID === id && a.日期 === d && a.狀態).length;
  return (
    <>
      <h1 className="text-2xl font-bold">小組點名</h1>
      <SheetImport kind="members" />
      {groups.length === 0 && (
        <Card>
          <Empty>{session.scope === 'own' ? '你還沒有負責的小組，請管理員在「小組設定」把你設為負責人。' : '還沒有小組。'}</Empty>
        </Card>
      )}
      {BASES.map((b) => {
        const list = groups.filter((g) => g.基地 === b.short);
        if (list.length === 0) return null;
        return (
          <Card key={b.short} title={`${b.name}（${b.note}）`}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((g) => (
                <Link key={g.小組ID} href={`/g/${g.小組ID}`} className="rounded-2xl border border-gray-200 bg-white p-4 transition hover:border-[#0f9d77] hover:shadow-sm">
                  <div className="text-lg font-bold">{g.名稱}</div>
                  <div className="mt-1 text-sm text-gray-600 tabular-nums">
                    組員 {size(g.小組ID)} 位・今天已點 {marked(g.小組ID)} 位
                  </div>
                  {g.說明 && <div className="mt-1 text-xs text-gray-500">{g.說明}</div>}
                </Link>
              ))}
            </div>
          </Card>
        );
      })}
    </>
  );
}
