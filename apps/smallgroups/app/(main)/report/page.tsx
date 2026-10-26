import { Alert, Card, Field, Input } from '@kids/ui';
import { ActionForm, SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { setLineGroup } from '@/lib/actions';
import { isDate, today } from '@/lib/data';
import { lineConfigured, lineGroupId } from '@/lib/line';
import { buildReport } from '@/lib/report';
import { ReportActions } from '@/components/ReportActions';

export const dynamic = 'force-dynamic';

/** LINE 統計：預覽某天的小組人數（推播格式）、複製、立即推送；設定推播的 LINE 群組 */
export default async function ReportPage({ searchParams }: { searchParams: { date?: string } }) {
  const session = requireSession({ permission: 'smallgroups' });
  const canManage = session.permissions.includes('smallgroup-settings');
  const date = isDate(searchParams.date) ? searchParams.date! : today();
  const [report, groupId] = await Promise.all([buildReport(date), lineGroupId()]);
  return (
    <>
      <h1 className="text-2xl font-bold">LINE 統計</h1>
      <Card title="小組人數統計">
        <form className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="日期">
            <Input type="date" name="date" defaultValue={date} />
          </Field>
          <SubmitButton size="sm" variant="secondary">
            查看
          </SubmitButton>
        </form>
        <pre className="whitespace-pre-wrap rounded-2xl bg-gray-50 p-4 text-sm leading-6">{report.text}</pre>
        <ReportActions date={date} text={report.text} canPush={canManage && !!groupId && lineConfigured()} />
        <p className="mt-2 text-xs text-gray-500">
          每週日 11:40 自動推送當天的統計到 LINE 群組。週日人數來自點名（新朋友＝第一次在該小組出席；同工＝負責人人數），線上人數由組長在點名頁填寫；其他未統計到＝當天有報到但沒有小組的孩子。
        </p>
      </Card>
      {canManage && (
        <Card title="LINE 推播設定">
          <div className="space-y-3 text-sm text-gray-700">
            {!lineConfigured() && <Alert tone="amber">尚未設定 LINE Channel access token（LINE_CHANNEL_ACCESS_TOKEN），目前無法推送。</Alert>}
            <p>
              推播群組：{groupId ? <span className="font-mono">{groupId}</span> : <span className="text-gray-500">尚未綁定</span>}
            </p>
            <p className="text-xs text-gray-500">把 LINE 官方帳號加入群組時，系統會自動記下群組 ID；也可以在下面手動填。</p>
            <ActionForm action={setLineGroup} className="flex flex-wrap items-end gap-2">
              <div className="min-w-72 flex-1">
                <Field label="LINE 群組 ID">
                  <Input name="groupId" defaultValue={groupId} placeholder="C 開頭、33 碼" />
                </Field>
              </div>
              <SubmitButton size="sm">儲存</SubmitButton>
            </ActionForm>
          </div>
        </Card>
      )}
    </>
  );
}
