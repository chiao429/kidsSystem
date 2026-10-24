import Link from 'next/link';
import { Card, Empty, Input, Table } from '@kids/ui';
import { requireSession } from '@kids/auth/next';
import { households, members } from '@/lib/tables';

export default async function FamiliesPage({ searchParams }: { searchParams: { q?: string } }) {
  requireSession({ permission: 'admin' });
  const q = (searchParams.q ?? '').trim();
  const [hh, mm] = await Promise.all([households().all(), members().all()]);
  const namesOf = (id: string) => mm.filter((m) => m.家庭ID === id).map((m) => m.姓名);
  const rows = q
    ? hh.filter((h) => [h.主要聯絡人, h.電話, h.家庭ID, ...namesOf(h.家庭ID)].some((v) => v.includes(q))).slice(0, 100)
    : [];
  return (
    <Card title="家庭與成員">
      <form className="mb-3 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="搜尋聯絡人、電話、成員姓名" className="max-w-sm" />
        <button className="rounded-lg border px-3 text-sm">搜尋</button>
      </form>
      {!q ? (
        <Empty>輸入關鍵字搜尋（共 {hh.length} 個家庭）</Empty>
      ) : rows.length === 0 ? (
        <Empty>沒有符合的家庭</Empty>
      ) : (
        <Table head={['主要聯絡人', '電話', '成員', '家庭ID']}>
          {rows.map((h) => (
            <tr key={h.家庭ID}>
              <td className="px-2 py-1.5">
                <Link href={`/families/${h.家庭ID}`} className="text-[#315bc7] underline">
                  {h.主要聯絡人 || '（未填）'}
                </Link>
              </td>
              <td className="px-2 py-1.5 tabular-nums">{h.電話}</td>
              <td className="px-2 py-1.5">{namesOf(h.家庭ID).join('、')}</td>
              <td className="px-2 py-1.5 font-mono text-xs text-gray-500">{h.家庭ID}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
