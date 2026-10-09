'use client';

import { useState, useTransition } from 'react';
import { Alert, Badge, Button } from '@kids/ui';
import { fetchRoll, saveRoll } from '@/lib/actions';
import type { RollMember } from '@/lib/data';

const OPTIONS = [
  { value: '出席', cls: 'bg-emerald-600 text-white border-emerald-600' },
  { value: '遲到', cls: 'bg-amber-500 text-white border-amber-500' },
  { value: '請假', cls: 'bg-blue-600 text-white border-blue-600' },
  { value: '缺席', cls: 'bg-red-600 text-white border-red-600' },
];

export function RollCall({ eventId, team, slotId, initial }: { eventId: string; team: string; slotId: string; initial: RollMember[] }) {
  const [members, setMembers] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = members.some((m, i) => m.狀態 !== saved[i]?.狀態 || m.備註 !== saved[i]?.備註);
  const set = (id: string, patch: Partial<RollMember>) => setMembers((ms) => ms.map((m) => (m.成員ID === id ? { ...m, ...patch } : m)));
  const count = (s: string) => members.filter((m) => m.狀態 === s).length;

  const save = () =>
    startTransition(async () => {
      const res = await saveRoll(
        eventId,
        team,
        slotId,
        members.filter((m) => m.狀態).map(({ 成員ID, 姓名, 狀態, 備註 }) => ({ 成員ID, 姓名, 狀態, 備註 })),
      );
      if (res.error) return setMsg({ tone: 'red', text: res.error });
      const fresh = await fetchRoll(eventId, team, slotId);
      setMembers(fresh);
      setSaved(fresh);
      setMsg({ tone: 'green', text: `已儲存（${res.saved} 筆變更）` });
    });

  return (
    <div className="space-y-3 pb-24">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setMembers((ms) => ms.map((m) => (m.狀態 ? m : { ...m, 狀態: m.checkedIn ? '出席' : m.absentNotice ? '請假' : '' })))}
        >
          依報到帶入
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setMembers((ms) => ms.map((m) => (m.狀態 ? m : { ...m, 狀態: '出席' })))}>
          其餘全部出席
        </Button>
      </div>

      <ul className="space-y-2">
        {members.map((m) => (
          <li key={m.成員ID} className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg font-semibold">{m.姓名}</span>
              {m.checkedIn ? <Badge tone="green">已報到</Badge> : m.absentNotice ? <Badge>不會出席</Badge> : <Badge tone="red">未報到</Badge>}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => set(m.成員ID, { 狀態: m.狀態 === o.value ? '' : o.value })}
                  className={`rounded-lg border py-2.5 text-base font-medium ${m.狀態 === o.value ? o.cls : 'border-gray-300 bg-white text-gray-700'}`}
                >
                  {o.value}
                </button>
              ))}
            </div>
            {(m.狀態 === '請假' || m.狀態 === '缺席' || m.備註) && (
              <input
                value={m.備註}
                onChange={(e) => set(m.成員ID, { 備註: e.target.value })}
                placeholder="備註（原因）"
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
            )}
          </li>
        ))}
      </ul>
      {members.length === 0 && <p className="py-8 text-center text-gray-500">這個小隊還沒有隊員</p>}

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
          <div className="text-sm text-gray-700">
            出席 {count('出席')}・遲到 {count('遲到')}・請假 {count('請假')}・缺席 {count('缺席')}・未點 {members.filter((m) => !m.狀態).length}
          </div>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
          <Button className="ml-auto" size="lg" onClick={save} disabled={pending || !dirty}>
            {pending ? '儲存中…' : dirty ? '儲存點名' : '已儲存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
