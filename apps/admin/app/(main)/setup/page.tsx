import { revalidatePath } from 'next/cache';
import { Alert, Badge, Card, Empty, Field, Input, Table } from '@kids/ui';
import { ActionForm, SubmitButton, type FormResult } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { MASTER_TABLES } from '@kids/schema';
import { dataBackend, ensureSheetTabs, extractSheetIdFromUrl, masterSheetSetting, setMasterSheetId } from '@kids/sheets-core';
import { pushDirty, resetSync, resolveConflict, syncStatus } from '@kids/sheets-core/mirror';
import { ensureMasterTables } from '@/lib/tables';

async function pushNow() {
  'use server';
  requireSession({ permission: 'setup' });
  await pushDirty({ maxTables: 50, timeBudgetMs: 50_000 });
  revalidatePath('/setup');
}

async function regenerate() {
  'use server';
  requireSession({ permission: 'setup' });
  await resetSync();
  revalidatePath('/setup');
}

async function markResolved(id: string) {
  'use server';
  requireSession({ permission: 'setup' });
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
                    <button className="text-xs text-[#315bc7] underline">已處理</button>
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

/** 綁定主資料試算表（MongoDB 模式）：先建立分頁確認 service account 有權限，再存設定並把主資料標為待同步 */
async function bindMasterSheet(_: FormResult, formData: FormData): Promise<FormResult> {
  'use server';
  const session = requireSession({ permission: 'setup' });
  const id = extractSheetIdFromUrl(String(formData.get('sheet') ?? '').trim());
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) return { error: '請貼上試算表網址或 ID' };
  try {
    await ensureSheetTabs(id, MASTER_TABLES);
  } catch (e) {
    return { error: `無法存取這份試算表，請確認已共用給 service account（編輯者）：${e instanceof Error ? e.message : e}` };
  }
  await setMasterSheetId(id, session.name);
  await resetSync(undefined, 'master');
  revalidatePath('/setup');
  return { message: '已綁定，主資料會在下一次同步時寫入這份試算表' };
}

/** 解除畫面上的綁定，改回環境變數 GOOGLE_MASTER_SHEET_ID */
async function unbindMasterSheet() {
  'use server';
  const session = requireSession({ permission: 'setup' });
  await setMasterSheetId('', session.name);
  await resetSync(undefined, 'master');
  revalidatePath('/setup');
}

async function MasterSheetCard() {
  const current = await masterSheetSetting();
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '未設定';
  const envId = process.env.GOOGLE_MASTER_SHEET_ID ?? '';
  return (
    <Card title="主資料試算表（Google Sheet 鏡像）">
      <div className="space-y-4 text-sm text-gray-700">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">目前：</span>
          {current.id ? (
            <a href={`https://docs.google.com/spreadsheets/d/${current.id}/edit`} target="_blank" rel="noreferrer" className="font-mono text-xs text-[#315bc7] underline">
              {current.id}
            </a>
          ) : (
            <span className="text-gray-500">尚未設定</span>
          )}
          {current.source === 'db' && <Badge tone="blue">畫面綁定</Badge>}
          {current.source === 'env' && <Badge tone="gray">環境變數</Badge>}
          {current.updatedBy && (
            <span className="text-xs text-gray-500">
              {current.updatedBy}・{fmt(current.updatedAt)}
            </span>
          )}
        </div>
        <p>
          正式與測試環境請各用一份試算表。新的試算表先「共用」給 service account（<span className="font-mono">{email}</span>），權限為編輯者，再貼上網址綁定；綁定時會自動建立分頁，主資料會在下一次同步時整份寫入。
        </p>
        <ActionForm action={bindMasterSheet} className="flex flex-wrap items-end gap-2">
          <div className="min-w-72 flex-1">
            <Field label="試算表網址或 ID">
              <Input name="sheet" placeholder="https://docs.google.com/spreadsheets/d/…/edit" />
            </Field>
          </div>
          <SubmitButton>綁定並建立分頁</SubmitButton>
        </ActionForm>
        {current.source === 'db' && (
          <form action={unbindMasterSheet}>
            <SubmitButton size="sm" variant="ghost">
              解除綁定{envId ? '（改回環境變數）' : ''}
            </SubmitButton>
          </form>
        )}
      </div>
    </Card>
  );
}

async function initMaster() {
  'use server';
  requireSession({ permission: 'setup' });
  await ensureMasterTables();
  revalidatePath('/setup');
}

export default async function SetupPage() {
  requireSession({ permission: 'setup' });
  const configured = !!(await masterSheetSetting()).id;
  return (
    <>
    {dataBackend() === 'mongo' && <MasterSheetCard />}
    {dataBackend() === 'mongo' && <SyncCard />}
    <Card title="初始化主資料試算表">
      <div className="space-y-3 text-sm text-gray-700">
        <p>
          會在主資料試算表中建立以下分頁與標題列（已存在的分頁只補上缺少的欄位，不會動到資料）：
        </p>
        <ul className="list-inside list-disc">
          {MASTER_TABLES.map((t) => (
            <li key={t.tab}>
              {t.tab}：{t.headers.join('、')}
            </li>
          ))}
        </ul>
        <p>請先將試算表「共用」給 service account（{process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '未設定'}），權限為編輯者。</p>
        {!configured && <Alert>尚未設定主資料試算表{dataBackend() === 'mongo' ? '，請在上方綁定' : '（GOOGLE_MASTER_SHEET_ID）'}</Alert>}
        <form action={initMaster}>
          <SubmitButton disabled={!configured}>建立 / 檢查分頁</SubmitButton>
        </form>
      </div>
    </Card>
    </>
  );
}
