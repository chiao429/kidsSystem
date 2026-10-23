'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Textarea } from '@kids/ui';
import type { CheckInOutcome, ScanRow } from '@/lib/types';

const AUTO_CLOSE_MS = 3000;

/** 這位孩子可以報到嗎？不行時回傳原因 */
export function blockedReason(r: ScanRow): string | null {
  if (!r.enrolled) return '未報名此課程';
  if (r.報到狀態 === '已到') return `已於 ${r.報到時間.split(' ')[1]?.slice(0, 5) ?? ''} 報到過`;
  if (r.報到狀態 === '不會出席') return '已標記「不會出席」，請先按「恢復」';
  return null;
}

/** 需要先確認：備取／待審核，或第一次報名（一般報到時補特殊需求） */
export function needsConfirm(r: ScanRow, course: string): boolean {
  if (blockedReason(r)) return false;
  return r.報名狀態 !== '正取' || (r.報名類型 === '第一次報名' && !r.報到狀態 && !course);
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
}: {
  rows: ScanRow[];
  course: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (items: { 報名ID: string; 特殊需求?: string }[]) => void;
}) {
  const [checked, setChecked] = useState(() => new Set(rows.filter((r) => !blockedReason(r) && r.報名狀態 === '正取').map((r) => r.報名ID)));
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.報名ID, r.特殊需求])));
  const first = rows[0];
  const askNote = (r: ScanRow) => r.報名類型 === '第一次報名' && !r.報到狀態 && !course;
  return (
    <Modal onClose={onCancel}>
      <h2 className="mb-1 pr-8 text-xl font-bold">確認報到</h2>
      <p className="mb-3 text-sm text-gray-600">
        {rows.some(askNote) && `第一次報名：請和家長確認電話（${first.電話}）並補充特殊需求。`}
        {rows.some((r) => r.報名狀態 !== '正取' && !blockedReason(r)) && '備取或待審核的孩子預設不勾選，確認後再勾選。'}
      </p>
      <div className="space-y-2">
        {rows.map((r) => {
          const blocked = blockedReason(r);
          return (
            <ChildInfo key={r.報名ID} r={r}>
              {blocked ? (
                <div className="mt-2 text-sm text-gray-500">{blocked}</div>
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
                  {askNote(r) && (
                    <Textarea
                      rows={2}
                      className="mt-2"
                      value={notes[r.報名ID] ?? ''}
                      onChange={(e) => setNotes({ ...notes, [r.報名ID]: e.target.value })}
                      placeholder="特殊需求（過敏、用藥、需特別照顧的地方；無則留白）"
                    />
                  )}
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
                .map((r) => (askNote(r) ? { 報名ID: r.報名ID, 特殊需求: notes[r.報名ID] ?? '' } : { 報名ID: r.報名ID })),
            )
          }
        >
          {pending ? '報到中…' : `確認報到（${checked.size} 位）`}
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

/** 報到結果：3 秒後自動關閉，也可點背景或關閉按鈕 */
export function ResultDialog({ result, onClose }: { result: ResultState; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [onClose]);
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

/** 錯誤訊息（例如查無 QR Code）：3 秒後自動關閉 */
export function MessageDialog({ text, onClose }: { text: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <Modal onClose={onClose} tone="red">
      <div className="pr-8 text-xl font-bold text-red-700">{text}</div>
      <Button className="mt-4 w-full" variant="secondary" onClick={onClose}>
        關閉
      </Button>
    </Modal>
  );
}
