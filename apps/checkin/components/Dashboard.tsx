'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { Badge, Button, Card, Stat, Table } from '@kids/ui';
import { fetchBoard, fetchSlots, toggleFlag } from '@/lib/actions';
import type { Board, SlotInfo } from '@/lib/types';

const REFRESH_MS = 15_000;

export function Dashboard({ eventId, initial, initialSlots }: { eventId: string; initial: Board; initialSlots: SlotInfo[] }) {
  const storageKey = `dashboard-teams:${eventId}`;
  const [board, setBoard] = useState(initial);
  const [slots, setSlots] = useState(initialSlots);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      setSelected(JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
    } catch {
      /* 無痕模式等情況讀不到就算了 */
    }
  }, [storageKey]);

  const choose = (teams: string[]) => {
    setSelected(teams);
    try {
      localStorage.setItem(storageKey, JSON.stringify(teams));
    } catch {
      /* ignore */
    }
  };

  const refresh = useCallback(async () => {
    const [b, s] = await Promise.all([fetchBoard(eventId), fetchSlots(eventId)]);
    setBoard(b);
    setSlots(s);
  }, [eventId]);

  useEffect(() => {
    const t = setInterval(() => void refresh().catch(() => {}), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const teamNames = useMemo(
    () => Array.from(new Set(board.rows.map((r) => r.小隊 || '未分隊'))).sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true })),
    [board],
  );
  const rows = selected.length ? board.rows.filter((r) => selected.includes(r.小隊 || '未分隊')) : board.rows;
  const arrived = rows.filter((r) => r.報到狀態 === '已到');
  const absent = rows.filter((r) => r.報到狀態 === '不會出席');
  const notArrived = rows.filter((r) => r.報到狀態 !== '已到' && r.報到狀態 !== '不會出席');
  const contacted = notArrived.filter((r) => r.已聯繫);
  const late = notArrived.filter((r) => r.晚到);

  const perTeam = teamNames
    .filter((t) => !selected.length || selected.includes(t))
    .map((t) => {
      const list = board.rows.filter((r) => (r.小隊 || '未分隊') === t);
      const slot = slots.find((s) => s.小隊 === t);
      return {
        t,
        區域: list[0]?.區域 ?? slot?.區域 ?? '',
        total: list.length,
        arrived: list.filter((r) => r.報到狀態 === '已到').length,
        absent: list.filter((r) => r.報到狀態 === '不會出席').length,
        slot,
      };
    });

  return (
    <div className="space-y-4">
      <Card title="小隊篩選" actions={selected.length > 0 && <Button size="sm" variant="ghost" onClick={() => choose([])}>清除</Button>}>
        <div className="flex flex-wrap gap-2">
          {teamNames.map((t) => {
            const on = selected.includes(t);
            return (
              <button
                key={t}
                onClick={() => choose(on ? selected.filter((x) => x !== t) : [...selected, t])}
                className={`rounded-full border px-3 py-1 text-sm ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white'}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="總人數" value={rows.length} tone="blue" />
        <Stat label="已報到" value={arrived.length} tone="green" sub={rows.length ? `${Math.round((arrived.length / rows.length) * 100)}%` : ''} />
        <Stat label="未報到" value={notArrived.length} tone="red" sub={late.length ? `其中晚到 ${late.length}` : ''} />
        <Stat label="不會出席" value={absent.length} />
        <Stat label="聯繫（未報到）" value={`${contacted.length}/${notArrived.length}`} tone="amber" sub={`待聯繫 ${notArrived.length - contacted.length}`} />
      </div>

      <Card title="各小隊">
        <Table head={['小隊', '區域', '已到 / 人數', '不會出席', '目前位置', '下一站']}>
          {perTeam.map((p) => (
            <tr key={p.t}>
              <td className="px-2 py-2 font-medium">{p.t}</td>
              <td className="px-2 py-2">{p.區域}</td>
              <td className="px-2 py-2 tabular-nums">
                {p.arrived} / {p.total}
              </td>
              <td className="px-2 py-2 tabular-nums">{p.absent || ''}</td>
              <td className="px-2 py-2">
                {p.slot?.current ? (
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-800">
                    {p.slot.current.時間} {p.slot.current.地點}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-2 py-2 text-gray-600">{p.slot?.next ? `${p.slot.next.時間} ${p.slot.next.地點}` : ''}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title={`未報到名單（${notArrived.length}）`}>
        <Table head={['序號', '姓名', '小隊', '家長', '電話', '狀態', '聯繫']}>
          {notArrived.map((r) => (
            <tr key={r.報名ID}>
              <td className="px-2 py-1.5 tabular-nums">{r.序號}</td>
              <td className="px-2 py-1.5 font-medium">{r.姓名}</td>
              <td className="px-2 py-1.5">{r.小隊}</td>
              <td className="px-2 py-1.5">{r.家長}</td>
              <td className="px-2 py-1.5">
                <a href={`tel:${r.電話}`} className="text-blue-700 underline tabular-nums">
                  {r.電話}
                </a>
              </td>
              <td className="px-2 py-1.5">
                {r.晚到 && <Badge tone="amber">晚到</Badge>} {r.報到狀態 === '取消報到' && <Badge tone="gray">取消報到</Badge>}
              </td>
              <td className="px-2 py-1.5">
                <Button
                  size="sm"
                  variant={r.已聯繫 ? 'success' : 'secondary'}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await toggleFlag(eventId, r.報名ID, '', '已聯繫', !r.已聯繫);
                      await refresh();
                    })
                  }
                >
                  {r.已聯繫 ? '已聯繫' : '待聯繫'}
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      <p className="text-right text-xs text-gray-400">每 15 秒自動更新・{board.updatedAt}</p>
    </div>
  );
}
