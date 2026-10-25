'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Alert, Badge, Button, Card, Input, Select, buttonClass } from '@kids/ui';
import { checkInMany, fetchBoard, lookupScan, setPayment, setStatus, toggleFlag } from '@/lib/actions';
import { CheckInStatus } from '@kids/schema';
import type { ActionResult, Board, BoardRow, ScanRow } from '@/lib/types';
import { ConfirmDialog, MessageDialog, ResultDialog, blockedReason, needsConfirm, type CheckInItem, type ResultState } from './CheckInDialogs';
import { Scanner } from './Scanner';
import { BaseTabs, useBaseFilter } from './BaseTabs';

const REFRESH_MS = 10_000;

function statusBadge(r: BoardRow) {
  if (r.報到狀態 === '已到') return <Badge tone="green">已到 {r.報到時間.split(' ')[1]?.slice(0, 5)}</Badge>;
  if (r.報到狀態 === '不會出席') return <Badge tone="gray">不會出席</Badge>;
  if (r.報到狀態 === '取消報到') return <Badge tone="amber">取消報到</Badge>;
  return <Badge tone="red">未到</Badge>;
}

export function CheckInBoard({ eventId, initial, autoCheckIn = [] }: { eventId: string; initial: Board; autoCheckIn?: string[] }) {
  const [board, setBoard] = useState(initial);
  const [course, setCourse] = useState(initial.course);
  const [query, setQuery] = useState('');
  const [base, setBase] = useBaseFilter(eventId);
  const [filter, setFilter] = useState<'all' | 'pending' | 'arrived'>('all');
  const [flash, setFlash] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState<{ rows: ScanRow[]; method: string } | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const [message, setMessage] = useState('');
  const dialogOpen = !!confirming || !!result || !!message;
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  // 剛現場報名的孩子：標示並排在最上面
  const [highlight] = useState<Set<string>>(new Set(autoCheckIn));
  // 收費視窗（不用瀏覽器的 prompt，部分環境不支援）
  const [paying, setPaying] = useState<{ row: BoardRow; amount: string } | null>(null);
  // 確認視窗（瀏覽器的 confirm() 在部分環境不支援，改用頁面內視窗）
  const [asking, setAsking] = useState<{ text: string; ok: string; run: () => void } | null>(null);

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

  const closeResult = useCallback(() => {
    setResult(null);
    searchRef.current?.focus();
  }, []);
  const closeMessage = useCallback(() => setMessage(''), []);

  /** 幫指定的孩子報到，然後彈出結果視窗 */
  const runCheckIn = (rows: ScanRow[], method: string, items: CheckInItem[]) =>
    startTransition(async () => {
      // 確認視窗勾了收費的孩子：先記錄繳費，再報到
      for (const i of items) if (i.繳費 != null) await setPayment(eventId, i.報名ID, true, i.繳費);
      const outcomes = items.length > 0 ? await checkInMany(eventId, course, method, items.map(({ 繳費: _p, ...rest }) => rest)) : [];
      const chosen = new Set(items.map((i) => i.報名ID));
      setConfirming(null);
      setResult({ rows, outcomes, skipped: rows.filter((r) => !blockedReason(r) && !chosen.has(r.報名ID)).map((r) => r.報名ID) });
      setQuery('');
      await refresh();
    });

  /** 一般情況直接報到；有備取、待審核、第一次報名時先彈出確認視窗 */
  const handleRows = (rows: ScanRow[], method: string) => {
    if (rows.some((r) => needsConfirm(r, course))) {
      setConfirming({ rows, method });
      return;
    }
    runCheckIn(rows, method, rows.filter((r) => !blockedReason(r)).map((r) => ({ 報名ID: r.報名ID })));
  };

  // 現場報名完成回到這裡：直接幫剛報名的孩子報到（一般報到），並清掉網址上的參數
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoDone.current || autoCheckIn.length === 0) return;
    autoDone.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    const rows = board.rows.filter((r) => autoCheckIn.includes(r.報名ID)).map((r) => ({ ...r, enrolled: true }));
    if (rows.length > 0) runCheckIn(rows, '現場', rows.map((r) => ({ 報名ID: r.報名ID })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pay = (r: BoardRow) => {
    if (r.繳費狀態 === '已繳') {
      setAsking({ text: `取消 ${r.姓名} 的繳費紀錄（${r.繳費金額} 元）？`, ok: '取消繳費', run: () => act(() => setPayment(eventId, r.報名ID, false, 0)) });
      return;
    }
    setPaying({ row: r, amount: String(r.應繳) });
  };
  const confirmPay = () => {
    if (!paying) return;
    const { row, amount } = paying;
    setPaying(null);
    // 繳費完成同時報到（還沒報到的才報到；標記不會出席的不動）
    startTransition(async () => {
      const res = await setPayment(eventId, row.報名ID, true, Number(amount));
      show(res);
      await refresh();
      if (!res.error && row.報到狀態 !== '已到' && row.報到狀態 !== '不會出席') startCheckIn({ ...row, 繳費狀態: '已繳' });
    });
  };

  const startCheckIn = (row: BoardRow, method = '搜尋') => handleRows([{ ...row, enrolled: true }], method);

  const act = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      show(await fn());
      await refresh();
    });

  /** QR 內容為報名ID（個人）或家庭ID（全家） */
  const onScan = useCallback(
    (text: string) => {
      if (dialogOpen) return;
      startTransition(async () => {
        const res = await lookupScan(eventId, text, course);
        if (res.error || !res.rows) setMessage(res.error ?? '查無資料');
        else handleRows(res.rows, 'QR');
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventId, course, dialogOpen],
  );

  // 掃描槍：輸入框收到完整報名ID 或家庭ID 直接報到
  const onQueryChange = (v: string) => {
    setQuery(v);
    if (/^[RH]-\d{8}-[A-Z0-9]{6}$/.test(v.trim())) onScan(v.trim());
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return board.rows
      .filter((r) => !base || r.基地 === base)
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
      )
      .sort((a, b) => Number(highlight.has(b.報名ID)) - Number(highlight.has(a.報名ID)));
  }, [board, query, filter, highlight, base]);

  const baseRows = base ? board.rows.filter((r) => r.基地 === base) : board.rows;
  const arrived = baseRows.filter((r) => r.報到狀態 === '已到').length;

  return (
    <div className="space-y-4">
      <BaseTabs rows={board.rows} value={base} onChange={setBase} />
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-lg font-semibold">
            已到 <span className="text-2xl text-emerald-700 tabular-nums">{arrived}</span>
            <span className="text-gray-500"> / {baseRows.length}</span>
          </div>
          {board.groups.some((g) => g.類型 === '課程') && (
            <Select
              value={course}
              className="max-w-[12rem]"
              onChange={(e) => {
                setCourse(e.target.value);
                void refresh(e.target.value);
              }}
            >
              <option value="">一般報到</option>
              {board.groups
                .filter((g) => g.類型 === '課程')
                .map((c) => (
                  <option key={c.分組ID} value={c.分組ID}>
                    課程：{c.名稱}
                  </option>
                ))}
            </Select>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={() => setScanning((v) => !v)}>
              📷 掃描 QR
            </Button>
            {/* 跨系統：報名系統的現場報名頁，完成後會帶著報名ID 回到這裡直接報到 */}
            <a href={`/e/${eventId}/onsite`} className={buttonClass('secondary')}>
              ＋ 現場報名
            </a>
          </div>
        </div>
        {scanning && (
          <div className="mt-3">
            <Scanner onScan={onScan} onClose={() => setScanning(false)} paused={dialogOpen || pending} />
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

      {confirming && (
        <ConfirmDialog
          rows={confirming.rows}
          course={course}
          pending={pending}
          onCancel={() => setConfirming(null)}
          onSetAbsent={async (報名ID) => {
            const res = await setStatus(eventId, 報名ID, course, CheckInStatus.Absent);
            if (!res.error) {
              setConfirming((current) =>
                current
                  ? { ...current, rows: current.rows.map((r) => (r.報名ID === 報名ID ? { ...r, 報到狀態: '不會出席' } : r)) }
                  : current,
              );
              await refresh();
            }
            return res;
          }}
          onConfirm={(items) => runCheckIn(confirming.rows, confirming.method, items)}
        />
      )}
      {result && <ResultDialog result={result} onClose={closeResult} />}
      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="ask-text">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <p id="ask-text" className="text-lg font-bold">
              {asking.text}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" autoFocus onClick={() => setAsking(null)}>
                返回
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const { run } = asking;
                  setAsking(null);
                  run();
                }}
              >
                {asking.ok}
              </Button>
            </div>
          </div>
        </div>
      )}
      {paying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="pay-title">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <h2 id="pay-title" className="text-lg font-bold">
              收費：{paying.row.姓名}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {paying.row.報到狀態 !== '已到' && paying.row.報到狀態 !== '不會出席' && '收費後會同時完成報到。'}
              應收 {paying.row.應繳} 元{paying.row.課程.length > 0 && `（${paying.row.課程.map((c) => c.名稱).join('、')}）`}
            </p>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              收取金額（元）
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                autoFocus
                className="mt-1 text-lg"
                value={paying.amount}
                onChange={(e) => setPaying({ ...paying, amount: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && confirmPay()}
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPaying(null)}>
                取消
              </Button>
              <Button onClick={confirmPay} disabled={pending || paying.amount === ''}>
                {paying.row.報到狀態 !== '已到' && paying.row.報到狀態 !== '不會出席' ? '確認收費並報到' : '確認收費'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {message && <MessageDialog text={message} onClose={closeMessage} />}

      <div className="space-y-2">
        {rows.slice(0, 100).map((r) => (
          <div
            key={r.報名ID}
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-white p-3 ${highlight.has(r.報名ID) ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-gray-200'}`}
          >
            <div className="min-w-[10rem] flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold">{r.姓名}</span>
                <span className="text-sm text-gray-500 tabular-nums">#{r.序號}</span>
                {statusBadge(r)}
                {r.晚到 && <Badge tone="amber">晚到</Badge>}
                {r.報名狀態 !== '正取' && <Badge tone="purple">{r.報名狀態}</Badge>}
                {r.報名類型 === '第一次報名' && <Badge tone="blue">第一次</Badge>}
                {!base && <Badge tone={r.基地 === '夢夢' ? 'purple' : 'blue'}>{r.基地}</Badge>}
                {highlight.has(r.報名ID) && <Badge tone="green">剛現場報名</Badge>}
                {r.繳費狀態 === '已繳' ? <Badge tone="green">已繳 {r.繳費金額} 元</Badge> : r.應繳 > 0 && <Badge tone="amber">未繳 {r.應繳} 元</Badge>}
              </div>
              <div className="text-sm text-gray-600">
                {r.年級}
                {r.小隊 && `・${r.小隊}`}
                {r.家長 && `・${r.家長} ${r.電話}`}
                {r.課程.length > 0 && `・${r.課程.map((c) => c.名稱).join('、')}`}
              </div>
              {r.特殊需求 && <div className="text-sm text-red-700">⚠ {r.特殊需求}</div>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(r.應繳 > 0 || r.繳費狀態 === '已繳') && (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => pay(r)}>
                  {r.繳費狀態 === '已繳' ? '取消繳費' : '收費'}
                </Button>
              )}
              {r.報到狀態 === '已到' ? (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => setAsking({ text: `取消 ${r.姓名} 的報到？`, ok: '取消報到', run: () => act(() => setStatus(eventId, r.報名ID, course, '取消報到')) })}>
                  取消報到
                </Button>
              ) : (
                <>
                  <Button
                    size="lg"
                    variant="success"
                    disabled={pending || r.報到狀態 === '不會出席'}
                    title={r.報到狀態 === '不會出席' ? '已標記不會出席，請先按「恢復」' : undefined}
                    onClick={() => startCheckIn(r)}
                  >
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
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAsking({ text: `標記 ${r.姓名} 不會出席？`, ok: '標記不會出席', run: () => act(() => setStatus(eventId, r.報名ID, course, '不會出席')) })}>
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
