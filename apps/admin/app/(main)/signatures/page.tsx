import Link from 'next/link';
import { Badge, Card, Empty, Table, buttonClass } from '@kids/ui';
import { SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { createSignature, setDefaultSignature } from '@/lib/signature-actions';
import { listSignatures } from '@/lib/signatures';
import { events } from '@/lib/tables';

export default async function SignaturesPage() {
  requireSession({ permission: 'signatures' });
  const [all, evs] = await Promise.all([listSignatures(), events().all()]);
  const usedBy = (id: string, isDefault: boolean) => evs.filter((e) => e.簽名檔 === id || (isDefault && !e.簽名檔)).length;
  return (
    <Card
      title="簽名檔"
      actions={
        <form action={createSignature}>
          <SubmitButton size="sm">新增簽名檔</SubmitButton>
        </form>
      }
    >
      <p className="mb-3 text-sm text-gray-600">
        簽名檔會顯示在家長報名頁的活動說明下方，適合放每次都一樣的提醒事項與聯絡方式。標為「預設」的簽名檔會用在沒有另外指定的活動；每場活動可在「活動說明」分頁改用其他簽名檔或不使用。
      </p>
      {all.length === 0 ? (
        <Empty>還沒有簽名檔。</Empty>
      ) : (
        <Table head={['名稱', '使用中的活動', '最後更新', '']}>
          {all.map((s) => {
            const isDefault = s.預設 === 'Y';
            return (
              <tr key={s.簽名檔ID}>
                <td className="px-2 py-2">
                  <span className="font-medium">{s.名稱}</span> {isDefault && <Badge tone="green">預設</Badge>}
                </td>
                <td className="px-2 py-2 text-gray-600">{usedBy(s.簽名檔ID, isDefault)} 場</td>
                <td className="px-2 py-2 text-gray-500">{s.更新時間}</td>
                <td className="whitespace-nowrap px-2 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {!isDefault && (
                      <form action={setDefaultSignature.bind(null, s.簽名檔ID)}>
                        <SubmitButton variant="ghost" size="sm">
                          設為預設
                        </SubmitButton>
                      </form>
                    )}
                    <Link href={`/signatures/${s.簽名檔ID}`} className={buttonClass('secondary', 'sm')}>
                      編輯
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </Card>
  );
}
