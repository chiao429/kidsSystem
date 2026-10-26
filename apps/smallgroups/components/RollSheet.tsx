'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, Empty, Input, Textarea } from '@kids/ui';
import { addMember, saveAttendance, syncCheckIns } from '@/lib/actions';

export interface RollRow {
  成員ID: string;
  姓名: string;
  年級: string;
  特殊需求: string;
  狀態: string;
  當天狀況: string;
  備註: string;
  操作者: string;
  /** 當天有在活動報到 */
  報到: boolean;
}

export interface Candidate {
  成員ID: string;
  姓名: string;
  年級: string;
  活動: string;
  現場報名: boolean;
}

const STATUS = [
  { v: '出席', on: 'bg-emerald-600 text-white border-emerald-600' },
  { v: '遲到', on: 'bg-amber-500 text-white border-amber-500' },
  { v: '請假', on: 'bg-sky-600 text-white border-sky-600' },
  { v: '缺席', on: 'bg-red-600 text-white border-red-600' },
];

/** 小組點名表：點出席狀態立即儲存；當天狀況、備註離開欄位時儲存 */
export function RollSheet({
  groupId,
  date,
  prev,
  next,
  isToday,
  rows: initial,
  candidates,
}: {
  groupId: string;
  date: string;
  prev: string;
  next: string;
  isToday: boolean;
  rows: RollRow[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [synced, setSynced] = useState('');
  const [pending, startTransition] = useTransition();
  useEffect(() => setRows(initial), [initial]);

  // 進來時把當天有報到的組員自動點名出席，有新帶入的才重新整理
  const syncedOnce = useRef(false);
  useEffect(() => {
    if (syncedOnce.current) return;
    syncedOnce.current = true;
    void syncCheckIns(groupId, date)
      .then((res) => {
        if (res.added > 0) {
          setSynced(`已依當天報到自動點名 ${res.added} 位出席`);
          router.refresh();
        }
      })
      .catch(() => setError('帶入報到資料失敗，請重新整理'));
  }, [groupId, date, router]);

  const save = async (id: string, changes: { 狀態?: string; 當天狀況?: string; 備註?: string }) => {
    setError('');
    setSaving((s) => ({ ...s, [id]: true }));
    setRows((rs) => rs.map((r) => (r.成員ID === id ? { ...r, ...changes } : r)));
    const res = await saveAttendance(groupId, id, date, changes).catch(() => ({ error: '儲存失敗，請檢查網路' }));
    setSaving((s) => ({ ...s, [id]: false }));
    if (res.error) setError(res.error);
  };

  const join = (k: Candidate) =>
    startTransition(async () => {
      setError('');
      const res = await addMember(groupId, k.成員ID, { date, markPresent: true, 來源: k.現場報名 ? '現場報名' : '當天報到' });
      if (res.error) setError(res.error);
      else router.refresh();
    });

  const count = (v: string) => rows.filter((r) => r.狀態 === v).length;
  const unmarked = rows.filter((r) => !r.狀態).length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`?date=${prev}`} className="rounded-full border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
            ← 上週
          </Link>
          <input
            type="date"
            value={date}
            aria-label="聚會日期"
            onChange={(e) => e.target.value && router.push(`?date=${e.target.value}`)}
            className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm"
          />
          <Link href={`?date=${next}`} className="rounded-full border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
            下週 →
          </Link>
          {!isToday && (
            <Link href="?" className="text-sm text-[#0f9d77] underline">
              回到今天
            </Link>
          )}
          <div className="ml-auto text-sm text-gray-700 tabular-nums">
            出席 <b className="text-emerald-700">{count('出席')}</b>・遲到 {count('遲到')}・請假 {count('請假')}・缺席 {count('缺席')}・未點 {unmarked}／共 {rows.length}
          </div>
        </div>
        {synced && (
          <div className="mt-3">
            <Alert tone="green">{synced}</Alert>
          </div>
        )}
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
      </Card>

      {rows.length === 0 ? (
        <Card>
          <Empty>這一天小組裡還沒有組員，可以從下方「今天有報到」加入，或到「管理組員」挑選。</Empty>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.成員ID} className="rounded-2xl border border-gray-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{r.姓名}</span>
                <span className="text-sm text-gray-500">{r.年級}</span>
                {r.報到 && <Badge tone="green">今天已報到</Badge>}
                {r.操作者 === '報到同步' && r.狀態 === '出席' && <span className="text-xs text-gray-400">（依報到自動點名）</span>}
                {saving[r.成員ID] && <span className="text-xs text-gray-400">儲存中…</span>}
                <div className="ml-auto flex gap-1.5">
                  {STATUS.map((s) => (
                    <button
                      key={s.v}
                      type="button"
                      aria-pressed={r.狀態 === s.v}
                      onClick={() => void save(r.成員ID, { 狀態: r.狀態 === s.v ? '' : s.v })}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${r.狀態 === s.v ? s.on : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                    >
                      {s.v}
                    </button>
                  ))}
                </div>
              </div>
              {r.特殊需求 && <div className="mt-1 text-sm text-red-700">⚠ {r.特殊需求}</div>}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Field label="當天狀況">
                  <Input
                    defaultValue={r.當天狀況}
                    placeholder="例如：身體不適、表現很棒"
                    onBlur={(e) => e.target.value.trim() !== r.當天狀況 && void save(r.成員ID, { 當天狀況: e.target.value.trim() })}
                  />
                </Field>
                <Field label="備註">
                  <Textarea
                    rows={1}
                    defaultValue={r.備註}
                    onBlur={(e) => e.target.value.trim() !== r.備註 && void save(r.成員ID, { 備註: e.target.value.trim() })}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <Card title={`今天有報到、還沒有小組的孩子（${candidates.length}）`}>
          <p className="mb-3 text-sm text-gray-600">加入這個小組後會同時點名出席。孩子只會屬於一個小組。</p>
          <div className="space-y-2">
            {candidates.map((k) => (
              <div key={k.成員ID} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 px-3 py-2">
                <span className="font-semibold">{k.姓名}</span>
                <span className="text-sm text-gray-500">{k.年級}</span>
                {k.現場報名 && <Badge tone="amber">現場報名</Badge>}
                <span className="text-xs text-gray-400">{k.活動}</span>
                <Button size="sm" className="ml-auto" disabled={pending} onClick={() => join(k)}>
                  加入這個小組
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-gray-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
