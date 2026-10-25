import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card } from '@kids/ui';
import { SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { SignatureEditor } from '@/components/SignatureEditor';
import { deleteSignature } from '@/lib/signature-actions';
import { listSignatures } from '@/lib/signatures';

export default async function SignaturePage({ params }: { params: { signatureId: string } }) {
  requireSession({ permission: 'signatures' });
  const s = (await listSignatures()).find((x) => x.簽名檔ID === params.signatureId);
  if (!s) notFound();
  return (
    <>
      <Link href="/signatures" className="text-sm text-gray-500">
        ← 簽名檔
      </Link>
      <SignatureEditor id={s.簽名檔ID} initialName={s.名稱} initialHtml={s.內容} isDefault={s.預設 === 'Y'} />
      <Card title="刪除簽名檔">
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          {s.預設 === 'Y' && <Badge tone="amber">這是預設簽名檔</Badge>}
          <span>刪除後，指定使用這個簽名檔的活動會改用預設簽名檔。</span>
          <form action={deleteSignature.bind(null, s.簽名檔ID)}>
            <SubmitButton variant="danger" size="sm">
              刪除
            </SubmitButton>
          </form>
        </div>
      </Card>
    </>
  );
}
