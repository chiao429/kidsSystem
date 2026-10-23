import { revalidatePath } from 'next/cache';
import { Alert, Badge, Card, Empty, Table } from '@kids/ui';
import { SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { MASTER_TABLES } from '@kids/schema';
import { dataBackend } from '@kids/sheets-core';
import { pushDirty, resetSync, resolveConflict, syncStatus } from '@kids/sheets-core/mirror';
import { ensureMasterTables } from '@/lib/tables';

async function pushNow() {
  'use server';
  requireSession({ permission: 'accounts' });
  await pushDirty({ maxTables: 50, timeBudgetMs: 50_000 });
  revalidatePath('/setup');
}

async function regenerate() {
  'use server';
  requireSession({ permission: 'accounts' });
  await resetSync();
  revalidatePath('/setup');
}

async function markResolved(id: string) {
  'use server';
  requireSession({ permission: 'accounts' });
  await resolveConflict(id);
  revalidatePath('/setup');
}

const fmt = (d?: Date) => (d ? new Date(d).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '');

async function SyncCard() {
  const { rows, conflicts } = await syncStatus();
  return (
    <>
      <Card
        title="資料同步（MongoDB → Google Sheet）"
        actions={
          <div className="flex gap-2">
            <form action={pushNow}>
              <SubmitButton size="sm">立即同步</SubmitButton>
            </form>
            <form action={regenerate}>
              <SubmitButton size="sm" variant="secondary" pendingText="標記中…">
                重新產生 Sheet
              </SubmitButton>
            </form>
          </div>
        }
      >
        <p className="mb-3 text-sm text-gray-600">
          Google Sheet 是系統資料的鏡像，每 5 分鐘由 Apps Script 觸發同步。「重新產生 Sheet」會把所有資料標為待同步，下一次同步時整張重寫。
        </p>
        {rows.length === 0 ? (
          <Empty>尚無同步紀錄</Empty>
        ) : (
          <Table head={['範圍', '分頁', '待同步', '上次成功', '錯誤']}>
            {rows.map((r) => (
              <tr key={`${r.table}:${r.scope}`}>
                <td className="px-2 py-1.5">{r.scope === 'master' ? '主資料' : r.scope}</td>
                <td className="px-2 py-1.5">{r.tab}</td>
                <td className="px-2 py-1.5 tabular-nums">{r.pending ? <Badge tone="amber">{r.pending}</Badge> : ''}</td>
                <td className="whitespace-nowrap px-2 py-1.5 text-gray-500">{fmt(r.lastSuccessAt)}</td>
                <td className="px-2 py-1.5 text-red-700">{r.lastError ? `${r.lastError}（${r.failures} 次）` : ''}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title={`Sheet 寫回衝突（${conflicts.length}）`}>
        {conflicts.length === 0 ? (
          <Empty>沒有待處理的衝突</Empty>
        ) : (
          <Table head={['時間', '範圍', '分頁', 'ID', '欄位', 'Sheet 修改', '系統中的值', '編輯者', '']}>
            {conflicts.map((c) => (
              <tr key={c._id}>
                <td className="whitespace-nowrap px-2 py-1.5 text-gray-500">{fmt(c.at)}</td>
                <td className="px-2 py-1.5">{c.scope}</td>
                <td className="px-2 py-1.5">{c.tab}</td>
                <td className="px-2 py-1.5 font-mono text-xs">{c.id}</td>
                <td className="px-2 py-1.5">{c.header}</td>
                <td className="px-2 py-1.5">
                  {c.sheetOld} → {c.sheetNew}
                </td>
                <td className="px-2 py-1.5">{c.dbValue}</td>
                <td className="px-2 py-1.5">{c.editor}</td>
                <td className="px-2 py-1.5">
                  <form action={markResolved.bind(null, c._id)}>
                    <button className="text-xs text-purple-700 underline">已處理</button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

async function initMaster() {
  'use server';
  requireSession({ permission: 'accounts' });
  await ensureMasterTables();
  revalidatePath('/setup');
}

export default function SetupPage() {
  requireSession({ permission: 'accounts' });
  const configured = !!process.env.GOOGLE_MASTER_SHEET_ID;
  return (
    <>
    {dataBackend() === 'mongo' && <SyncCard />}
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
    </>
  );
}
