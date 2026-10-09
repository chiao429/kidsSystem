import { revalidatePath } from 'next/cache';
import { Alert, Card } from '@kids/ui';
import { SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { MASTER_TABLES } from '@kids/schema';
import { ensureMasterTables } from '@/lib/tables';

async function initMaster() {
  'use server';
  requireSession({ roles: ['admin'] });
  await ensureMasterTables();
  revalidatePath('/setup');
}

export default function SetupPage() {
  requireSession({ roles: ['admin'] });
  const configured = !!process.env.GOOGLE_MASTER_SHEET_ID;
  return (
    <Card title="初始化主資料試算表">
      <div className="space-y-3 text-sm text-gray-700">
        <p>
          會在 <code>GOOGLE_MASTER_SHEET_ID</code> 指定的試算表中建立以下分頁與標題列（已存在的分頁只補上缺少的欄位，不會動到資料）：
        </p>
        <ul className="list-inside list-disc">
          {MASTER_TABLES.map((t) => (
            <li key={t.tab}>
              {t.tab}：{t.headers.join('、')}
            </li>
          ))}
        </ul>
        <p>請先將試算表「共用」給 service account（{process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '未設定'}），權限為編輯者。</p>
        {!configured && <Alert>尚未設定 GOOGLE_MASTER_SHEET_ID</Alert>}
        <form action={initMaster}>
          <SubmitButton disabled={!configured}>建立 / 檢查分頁</SubmitButton>
        </form>
      </div>
    </Card>
  );
}
