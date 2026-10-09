'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Alert, Badge, Button, Card, Input, Select, Textarea } from '@kids/ui';
import { checkIn, fetchBoard, setStatus, toggleFlag } from '@/lib/actions';
import type { ActionResult, Board, BoardRow } from '@/lib/types';
import { Scanner } from './Scanner';

const REFRESH_MS = 10_000;

function statusBadge(r: BoardRow) {
  if (r.報到狀態 === '已到') return <Badge tone="green">已到 {r.報到時間.split(' ')[1]?.slice(0, 5)}</Badge>;
  if (r.報到狀態 === '不會出席') return <Badge tone="gray">不會出席</Badge>;
  if (r.報到狀態 === '取消報到') return <Badge tone="amber">取消報到</Badge>;
  return <Badge tone="red">未到</Badge>;
}

export function CheckInBoard({ eventId, initial, registrationUrl }: { eventId: string; initial: Board; registrationUrl?: string }) {
  const [board, setBoard] = useState(initial);
  const [course, setCourse] = useState(initial.course);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'arrived'>('all');
  const [flash, setFlash] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [firstTime, setFirstTime] = useState<{ row: BoardRow; method: string } | null>(null);
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(
    (c = course) => fetchBoard(eventId, c).then(setBoard).catch(() => setFlash({ tone: 'red', text: '更新失敗，請檢查網路' })),
    [eventId, course],
  );

  useEffect(() => {
    const t = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const show = (res: ActionResult, ok?: string) => {
    if (res.error) setFlash({ tone: 'red', text: res.error });
    else setFlash({ tone: 'green', text: res.message ?? ok ?? '完成' });
  };

  const doCheckIn = (row: BoardRow, method: string, extra: { force?: boolean; 特殊需求?: string } = {}) =>
    startTransition(async () => {
      let res = await checkIn(eventId, { 報名ID: row.報名ID, course, method, ...extra });
      if (res.confirm) {
        if (!window.confirm(res.confirm)) return;
        res = await checkIn(eventId, { 報名ID: row.報名ID, course, method, ...extra, force: true });
      }
      show(res);
      setQuery('');
      await refresh();
      searchRef.current?.focus();
    });

  const startCheckIn = (row: BoardRow, method = '搜尋') => {
    if (row.報名類型 === '第一次報名' && !row.報到狀態 && !course) {
      setNote(row.特殊需求);
      setFirstTime({ row, method });
      return;
    }
    doCheckIn(row, method);
  };

  const act = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      show(await fn());
      await refresh();
    });

  const onScan = useCallback(
    (text: string) => {
      const row = board.rows.find((r) => r.報名ID === text.trim());
      if (!row) setFlash({ tone: 'red', text: `查無此 QR Code：${text}` });
      else startCheckIn(row, 'QR');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [board, course],
  );

  // 掃描槍：輸入框收到完整報名ID 直接報到
  const onQueryChange = (v: string) => {
    setQuery(v);
    if (/^R-\d{8}-[A-Z0-9]{6}$/.test(v.trim())) onScan(v.trim());
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return board.rows
      .filter((r) => (filter === 'arrived' ? r.報到狀態 === '已到' : filter === 'pending' ? r.報到狀態 !== '已到' : true))
      .filter(
        (r) =>
          !q ||
          r.姓名.toLowerCase().includes(q) ||
          r.序號 === q ||
          r.序號.replace(/^0+/, '') === q.replace(/^0+/, '') ||
          r.家長.includes(q) ||
          r.電話.includes(q) ||
          r.小隊.toLowerCase().includes(q),
      );
  }, [board, query, filter]);

  const arrived = board.rows.filter((r) => r.報到狀態 === '已到').length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-lg font-semibold">
            已到 <span className="text-2xl text-emerald-700 tabular-nums">{arrived}</span>
            <span className="text-gray-500"> / {board.rows.length}</span>
          </div>
          {board.courses.length > 0 && (
            <Select
              value={course}
              className="max-w-[12rem]"
              onChange={(e) => {
                setCourse(e.target.value);
                void refresh(e.target.value);
              }}
            >
              <option value="">一般報到</option>
              {board.courses.map((c) => (
                <option key={c} value={c}>
                  課程：{c}
                </option>
              ))}
            </Select>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setScanning((v) => !v)}>
              📷 掃描 QR
            </Button>
            {registrationUrl && (
              <a href={`${registrationUrl}/e/${eventId}/new?source=現場`} target="_blank" rel="noreferrer">
                <Button variant="secondary">＋ 現場報名</Button>
              </a>
            )}
          </div>
        </div>
        {scanning && (
          <div className="mt-3">
            <Scanner onScan={onScan} onClose={() => setScanning(false)} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            ref={searchRef}
            autoFocus
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="姓名、序號、家長、電話、小隊，或用掃描槍掃 QR"
            className="min-w-[14rem] flex-1 text-lg"
          />
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="max-w-[8rem]">
            <option value="all">全部</option>
            <option value="pending">未報到</option>
            <option value="arrived">已報到</option>
          </Select>
        </div>
        {flash && (
          <div className="mt-3">
            <Alert tone={flash.tone}>{flash.text}</Alert>
          </div>
        )}
      </Card>

      {firstTime && (
        <Card title={`第一次報到：${firstTime.row.姓名}`}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              請和家長確認聯絡電話（{firstTime.row.電話}）並補充特殊需求（過敏、用藥、需特別照顧的地方）。
            </p>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="特殊需求（無則留白）" />
            <div className="flex gap-2">
              <Button
                variant="success"
                disabled={pending}
                onClick={() => {
                  const { row, method } = firstTime;
                  setFirstTime(null);
                  doCheckIn(row, method, { 特殊需求: note });
                }}
              >
                確認報到
              </Button>
              <Button variant="ghost" onClick={() => setFirstTime(null)}>
                取消
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {rows.slice(0, 100).map((r) => (
          <div key={r.報名ID} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gray-200 bg-white p-3">
            <div className="min-w-[10rem] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{r.姓名}</span>
                <span className="text-sm text-gray-500 tabular-nums">#{r.序號}</span>
                {statusBadge(r)}
                {r.晚到 && <Badge tone="amber">晚到</Badge>}
                {r.報名狀態 !== '正取' && <Badge tone="purple">{r.報名狀態}</Badge>}
                {r.報名類型 === '第一次報名' && <Badge tone="blue">第一次</Badge>}
              </div>
              <div className="text-sm text-gray-600">
                {r.年級}
                {r.小隊 && `・${r.小隊}`}
                {r.家長 && `・${r.家長} ${r.電話}`}
                {r.課程.length > 0 && `・${r.課程.join('、')}`}
              </div>
              {r.特殊需求 && <div className="text-sm text-red-700">⚠ {r.特殊需求}</div>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {r.報到狀態 === '已到' ? (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => confirm(`取消 ${r.姓名} 的報到？`) && act(() => setStatus(eventId, r.報名ID, course, '取消報到'))}>
                  取消報到
                </Button>
              ) : (
                <>
                  <Button size="lg" variant="success" disabled={pending} onClick={() => startCheckIn(r)}>
                    報到
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => toggleFlag(eventId, r.報名ID, course, '晚到', !r.晚到))}>
                    {r.晚到 ? '取消晚到' : '晚到'}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => toggleFlag(eventId, r.報名ID, course, '已聯繫', !r.已聯繫))}>
                    {r.已聯繫 ? '✓ 已聯繫' : '已聯繫'}
                  </Button>
                  {r.報到狀態 === '不會出席' ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setStatus(eventId, r.報名ID, course, ''))}>
                      恢復
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm(`標記 ${r.姓名} 不會出席？`) && act(() => setStatus(eventId, r.報名ID, course, '不會出席'))}>
                      不會出席
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {rows.length > 100 && <p className="text-center text-sm text-gray-500">只顯示前 100 筆，請輸入關鍵字縮小範圍</p>}
        {rows.length === 0 && <p className="py-8 text-center text-gray-500">沒有符合的資料</p>}
      </div>
      <p className="text-right text-xs text-gray-400">更新時間 {board.updatedAt}</p>
    </div>
  );
}
