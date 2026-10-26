import Link from 'next/link';
import { Badge, Card, Empty, Input, Table } from '@kids/ui';
import { isTestHousehold } from '@kids/schema';
import { requireSession } from '@kids/auth/next';
import { households, members } from '@/lib/tables';
import { DeleteButton } from '@/components/DeleteButton';
import { deleteHousehold } from '@/lib/family-actions';

export default async function FamiliesPage({ searchParams }: { searchParams: { q?: string } }) {
  requireSession({ permission: 'families' });
  const q = (searchParams.q ?? '').trim();
  const [hh, mm] = await Promise.all([households().all(), members().all()]);
  const namesOf = (id: string) => mm.filter((m) => m.家庭ID === id).map((m) => m.姓名);
  // 沒有關鍵字時直接列出全部家庭（新建立的在前）；家庭很多時只顯示前 LIMIT 筆
  const LIMIT = 200;
  const matched = (q ? hh.filter((h) => [h.主要聯絡人, h.電話, h.家庭ID, ...namesOf(h.家庭ID)].some((v) => v.includes(q))) : hh)
    .slice()
    .sort((a, b) => (b.建立時間 ?? '').localeCompare(a.建立時間 ?? ''));
  const rows = matched.slice(0, LIMIT);
  return (
    <Card title="家庭與成員">
      <form className="mb-3 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="搜尋聯絡人、電話、成員姓名" className="max-w-sm" />
        <button className="rounded-lg border px-3 text-sm">搜尋</button>
      </form>
      <p className="mb-2 text-sm text-gray-500">
        {q ? `符合「${q}」的家庭 ${matched.length} 個` : `共 ${hh.length} 個家庭`}
        {matched.length > LIMIT && `，只顯示最新的 ${LIMIT} 個，請用搜尋縮小範圍`}
      </p>
      {rows.length === 0 ? (
        <Empty>沒有符合的家庭</Empty>
      ) : (
        <Table head={['主要聯絡人', '電話', '成員', '家庭ID', '']}>
          {rows.map((h) => (
            <tr key={h.家庭ID}>
              <td className="px-2 py-1.5">
                <Link href={`/families/${h.家庭ID}`} className="text-[#315bc7] underline">
                  {h.主要聯絡人 || '（未填）'}
                </Link>
                {isTestHousehold(h) && (
                  <span className="ml-2">
                    <Badge tone="amber">測試</Badge>
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 tabular-nums">{h.電話}</td>
              <td className="px-2 py-1.5">{namesOf(h.家庭ID).join('、')}</td>
              <td className="px-2 py-1.5 font-mono text-xs text-gray-500">{h.家庭ID}</td>
              <td className="px-2 py-1.5 text-right">
                {/* 直接刪除家庭與成員（不是封存）；還有報名時會擋下 */}
                <DeleteButton
                  title={`刪除 ${h.主要聯絡人 || h.家庭ID} 的家庭？`}
                  description={`會直接刪除家庭資料與成員（${namesOf(h.家庭ID).join('、') || '無'}），無法復原。`}
                  action={deleteHousehold.bind(null, h.家庭ID)}
                />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
