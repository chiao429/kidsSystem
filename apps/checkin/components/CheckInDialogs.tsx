'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Textarea } from '@kids/ui';
import type { ActionResult, CheckInOutcome, ScanRow } from '@/lib/types';

/** 這位孩子可以報到嗎？不行時回傳原因 */
export function blockedReason(r: ScanRow): string | null {
  if (!r.enrolled) return '未報名此課程';
  if (r.報到狀態 === '已到') return `已於 ${r.報到時間.split(' ')[1]?.slice(0, 5) ?? ''} 報到過`;
  if (r.報到狀態 === '不會出席') return '已標記「不會出席」，請先按「恢復」';
  return null;
}

/** 一般報到時還沒繳費（有材料費要收） */
export const needsPayment = (r: ScanRow, course: string) => !course && r.應繳 > 0 && r.繳費狀態 !== '已繳';

/** 需要先確認：備取／待審核、第一次報名（一般報到時補特殊需求），或還沒繳費 */
export function needsConfirm(r: ScanRow, course: string): boolean {
  if (blockedReason(r)) return false;
  return r.報名狀態 !== '正取' || (r.報名類型 === '第一次報名' && !r.報到狀態 && !course) || needsPayment(r, course);
}

/** 確認視窗送出的每位孩子：可同時補特殊需求、記錄收費金額 */
export interface CheckInItem {
  報名ID: string;
  特殊需求?: string;
  繳費?: number;
}

/** 置中彈出視窗；點背景或關閉按鈕關閉 */
function Modal({ children, onClose, tone = 'white' }: { children: React.ReactNode; onClose: () => void; tone?: 'white' | 'green' | 'amber' | 'red' }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const border = { white: 'border-gray-200', green: 'border-emerald-500', amber: 'border-amber-500', red: 'border-red-500' }[tone];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose} role="dialog" aria-modal>
      <div
        className={`relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border-t-8 bg-white p-5 shadow-xl ${border}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-3 top-3 rounded-full px-2 text-2xl leading-none text-gray-400 hover:text-gray-700" aria-label="關閉">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}

function ChildInfo({ r, children }: { r: ScanRow; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-bold">{r.姓名}</span>
        <span className="text-gray-500 tabular-nums">#{r.序號}</span>
        <span className="text-gray-600">
          {[r.性別, r.年級].filter(Boolean).join('・')}
        </span>
        {r.報名狀態 !== '正取' && <Badge tone="purple">{r.報名狀態}</Badge>}
        {r.報名類型 === '第一次報名' && <Badge tone="blue">第一次</Badge>}
      </div>
      <div className="mt-1 text-sm text-gray-700">
        {r.小隊 && <span className="mr-3">小隊：{r.小隊}{r.區域 && `（${r.區域}）`}</span>}
        {r.課程.length > 0 && <span>課程：{r.課程.map((c) => c.名稱).join('、')}</span>}
      </div>
      {r.特殊需求 && <div className="mt-1 rounded bg-red-50 px-2 py-1 text-sm font-medium text-red-700">⚠ 特殊需求：{r.特殊需求}</div>}
      {children}
    </div>
  );
}

/** 報到前確認：可勾選要報到的孩子，第一次報名可補特殊需求 */
export function ConfirmDialog({
  rows,
  course,
  pending,
  onCancel,
  onConfirm,
  onSetAbsent,
  onRestore,
}: {
  rows: ScanRow[];
  course: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (items: CheckInItem[]) => void;
  onSetAbsent: (報名ID: string) => Promise<ActionResult>;
  /** 取消「不會出席」，恢復成可以報到 */
  onRestore: (報名ID: string) => Promise<ActionResult>;
}) {
  const [checked, setChecked] = useState(() => new Set(rows.filter((r) => !blockedReason(r) && r.報名狀態 === '正取').map((r) => r.報名ID)));
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.報名ID, r.特殊需求])));
  const [markingAbsent, setMarkingAbsent] = useState<string | null>(null);
  // 收費：每位孩子可勾選收費並調整金額（預設為應收）
  const [paying, setPaying] = useState<Set<string>>(() => new Set());
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.報名ID, String(r.應繳)])));
  const payTotal = rows.filter((r) => checked.has(r.報名ID) && paying.has(r.報名ID)).reduce((sum, r) => sum + (Number(amounts[r.報名ID]) || 0), 0);
  const [error, setError] = useState('');
  const first = rows[0];
  const askNote = (r: ScanRow) => r.報名類型 === '第一次報名' && !r.報到狀態 && !course;
  return (
    <Modal onClose={onCancel}>
      <h2 className="mb-1 pr-8 text-xl font-bold">確認報到</h2>
      <p className="mb-3 text-sm text-gray-600">
        {rows.some(askNote) && `第一次報名：請和家長確認電話（${first.電話}）並補充特殊需求。`}
        {rows.some((r) => r.報名狀態 !== '正取' && !blockedReason(r)) && '備取或待審核的孩子預設不勾選，確認後再勾選。'}
        {rows.some((r) => needsPayment(r, course)) && '有材料費未繳的孩子，收費後勾選「收費」並確認金額。'}
      </p>
      {error && <p className="mb-3 rounded bg-red-50 px-2 py-1 text-sm text-red-700">{error}</p>}
      <div className="space-y-2">
        {rows.map((r) => {
          const blocked = blockedReason(r);
          return (
            <ChildInfo key={r.報名ID} r={r}>
              {blocked ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  {r.報到狀態 === '不會出席' ? '已標記「不會出席」' : blocked}
                  {r.報到狀態 === '不會出席' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || markingAbsent !== null}
                      onClick={async () => {
                        setError('');
                        setMarkingAbsent(r.報名ID);
                        const res = await onRestore(r.報名ID);
                        setMarkingAbsent(null);
                        if (res.error) setError(res.error);
                        // 恢復後正取的孩子重新勾選報到
                        else if (r.報名狀態 === '正取') setChecked((current) => new Set(current).add(r.報名ID));
                      }}
                    >
                      {markingAbsent === r.報名ID ? '恢復中…' : '恢復'}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <label className="mt-2 flex items-center gap-2 font-medium">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={checked.has(r.報名ID)}
                      onChange={(e) => {
                        const next = new Set(checked);
                        if (e.target.checked) next.add(r.報名ID);
                        else next.delete(r.報名ID);
                        setChecked(next);
                      }}
                    />
                    報到
                  </label>
                  {!course && r.繳費狀態 === '已繳' && <div className="mt-2 text-sm text-emerald-700">已繳 {r.繳費金額} 元</div>}
                  {needsPayment(r, course) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={paying.has(r.報名ID)}
                          onChange={(e) => {
                            const next = new Set(paying);
                            if (e.target.checked) next.add(r.報名ID);
                            else next.delete(r.報名ID);
                            setPaying(next);
                          }}
                        />
                        收費
                      </label>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`${r.姓名} 收費金額`}
                        className="w-24 rounded-xl border border-gray-300 px-2 py-1 tabular-nums"
                        value={amounts[r.報名ID] ?? ''}
                        onChange={(e) => setAmounts({ ...amounts, [r.報名ID]: e.target.value })}
                      />
                      <span className="text-gray-500">元（應收 {r.應繳} 元）</span>
                    </div>
                  )}
                  {askNote(r) && (
                    <Textarea
                      rows={2}
                      className="mt-2"
                      value={notes[r.報名ID] ?? ''}
                      onChange={(e) => setNotes({ ...notes, [r.報名ID]: e.target.value })}
                      placeholder="特殊需求（過敏、用藥、需特別照顧的地方；無則留白）"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    disabled={pending || markingAbsent !== null}
                    onClick={async () => {
                      setError('');
                      setMarkingAbsent(r.報名ID);
                      const res = await onSetAbsent(r.報名ID);
                      setMarkingAbsent(null);
                      if (res.error) setError(res.error);
                      else setChecked((current) => {
                        const next = new Set(current);
                        next.delete(r.報名ID);
                        return next;
                      });
                    }}
                  >
                    {markingAbsent === r.報名ID ? '設定中…' : '不會到'}
                  </Button>
                </>
              )}
            </ChildInfo>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2">
        <Button
          variant="success"
          size="lg"
          disabled={pending || checked.size === 0}
          onClick={() =>
            onConfirm(
              rows
                .filter((r) => checked.has(r.報名ID))
                .map((r) => ({
                  報名ID: r.報名ID,
                  ...(askNote(r) ? { 特殊需求: notes[r.報名ID] ?? '' } : {}),
                  ...(needsPayment(r, course) && paying.has(r.報名ID) ? { 繳費: Number(amounts[r.報名ID]) || 0 } : {}),
                })),
            )
          }
        >
          {pending ? '報到中…' : `確認報到（${checked.size} 位）${payTotal > 0 ? `・收費 ${payTotal} 元` : ''}`}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </Modal>
  );
}

export interface ResultState {
  rows: ScanRow[];
  outcomes: CheckInOutcome[];
  /** 確認視窗中未勾選的孩子 */
  skipped?: string[];
}

/** 報到結果：由工作人員手動關閉 */
export function ResultDialog({ result, onClose }: { result: ResultState; onClose: () => void }) {
  const outcomeOf = (id: string) => result.outcomes.find((o) => o.報名ID === id);
  const done = result.outcomes.filter((o) => o.status === 'done').length;
  const failed = result.outcomes.some((o) => o.status === 'error');
  const tone = done > 0 ? 'green' : failed ? 'red' : 'amber';
  return (
    <Modal onClose={onClose} tone={tone}>
      <div className={`mb-3 pr-8 text-2xl font-bold ${{ green: 'text-emerald-700', red: 'text-red-700', amber: 'text-amber-700' }[tone]}`}>
        {done > 0 ? `✓ 報到成功（${done} 位）` : failed ? '報到失敗' : '沒有新的報到'}
      </div>
      <div className="space-y-2">
        {result.rows.map((r) => {
          const o = outcomeOf(r.報名ID);
          const status = o
            ? { done: <Badge tone="green">報到成功</Badge>, already: <Badge tone="amber">{o.message.replace(r.姓名, '').trim()}</Badge>, error: <Badge tone="red">{o.message}</Badge> }[o.status]
            : result.skipped?.includes(r.報名ID)
              ? <Badge tone="gray">未勾選，未報到</Badge>
              : <Badge tone="gray">{blockedReason(r) ?? '未報到'}</Badge>;
          return (
            <ChildInfo key={r.報名ID} r={r}>
              <div className="mt-2">{status}</div>
            </ChildInfo>
          );
        })}
      </div>
      <Button className="mt-4 w-full" size="lg" variant="secondary" onClick={onClose}>
        關閉（繼續掃描）
      </Button>
    </Modal>
  );
}

/** 錯誤訊息（例如查無 QR Code）：由工作人員手動關閉 */
export function MessageDialog({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <Modal onClose={onClose} tone="red">
      <div className="pr-8 text-xl font-bold text-red-700">{text}</div>
      <Button className="mt-4 w-full" variant="secondary" onClick={onClose}>
        關閉
      </Button>
    </Modal>
  );
}
