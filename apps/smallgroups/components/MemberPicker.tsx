'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { Alert, Badge, Button, Card, Empty, Input, buttonClass, withBase } from '@kids/ui';
import { addMember, importMembers, removeMember } from '@/lib/actions';
import type { ImportRow } from '@/lib/member-sheet';

interface Kid {
  成員ID: string;
  姓名: string;
  年級: string;
  家長: string;
  電話: string;
  inGroup: boolean;
  目前小組: string;
}

/** 組員名單＋搜尋家庭資料的孩子（姓名、家長、電話）加入 */
export function MemberPicker({ groupId, kids }: { groupId: string; kids: Kid[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState<{ added: number; already: number; problems: string[] } | null>(null);
  const [pending, startTransition] = useTransition();
  const members = kids.filter((k) => k.inGroup);
  const results = useMemo(() => {
    const s = q.trim();
    if (!s) return [];
    return kids.filter((k) => !k.inGroup && (k.姓名.includes(s) || k.家長.includes(s) || k.電話.includes(s))).slice(0, 30);
  }, [kids, q]);
  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      setError('');
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  /** 匯入 Excel／CSV：讀第一個工作表，依「姓名、家長電話、成員ID」欄找孩子 */
  const importFile = (file: File) =>
    startTransition(async () => {
      setError('');
      setReport(null);
      try {
        // CSV 以 UTF-8 文字讀取（直接讀位元組會把中文欄位名稱解錯）；Excel 讀位元組
        const isCsv = /\.csv$/i.test(file.name);
        const wb = isCsv ? XLSX.read((await file.text()).replace(/^\uFEFF/, ''), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
        // 欄位名稱去掉前後空白，避免「姓名 」之類的打字差異
        const pick = (r: Record<string, unknown>, key: string) => String(Object.entries(r).find(([k]) => k.trim() === key)?.[1] ?? '').trim();
        const rows: ImportRow[] = data.map((r) => ({ 姓名: pick(r, '姓名'), 家長電話: pick(r, '家長電話'), 成員ID: pick(r, '成員ID') }));
        if (!rows.some((r) => r.姓名 || r.成員ID)) return setError('檔案裡沒有資料，請確認第一列是欄位名稱（姓名、家長電話…），可以先下載匯入範例');
        const res = await importMembers(groupId, rows);
        if (res.error) return setError(res.error);
        setReport({ added: res.added ?? 0, already: res.already ?? 0, problems: res.problems ?? [] });
        router.refresh();
      } catch {
        setError('無法讀取這個檔案，請使用 Excel（.xlsx）或 CSV');
      }
    });

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <Card title="匯入／匯出">
        <div className="flex flex-wrap items-center gap-2">
          <a href={withBase(`/g/${groupId}/members/export`)} download className={buttonClass('secondary', 'sm')}>
            匯出組員
          </a>
          <a href={withBase(`/g/${groupId}/members/export?template=1`)} download className={buttonClass('ghost', 'sm')}>
            下載匯入範例
          </a>
          <label className={`${buttonClass('primary', 'sm')} cursor-pointer`}>
            {pending ? '匯入中…' : '匯入 Excel／CSV'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              disabled={pending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) importFile(f);
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500">依「姓名＋家長電話」或「成員ID」找到家庭資料裡的孩子加入；已在其他小組的會換過來，檔案裡沒有的組員不會被移出。</p>
        {report && (
          <div className="mt-3 space-y-2">
            <Alert tone={report.problems.length ? 'amber' : 'green'}>
              新加入 {report.added} 位{report.already > 0 && `，${report.already} 位原本就在小組`}
              {report.problems.length > 0 && `，${report.problems.length} 筆無法匯入`}
            </Alert>
            {report.problems.length > 0 && (
              <ul className="list-inside list-disc text-sm text-gray-700">
                {report.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
      <Card title={`組員（${members.length}）`}>
        {members.length === 0 ? (
          <Empty>還沒有組員</Empty>
        ) : (
          <div className="divide-y">
            {members.map((k) => (
              <div key={k.成員ID} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-semibold">{k.姓名}</span>
                <span className="text-sm text-gray-500">{k.年級}</span>
                <span className="text-sm text-gray-500">
                  {k.家長} {k.電話}
                </span>
                <Button size="sm" variant="ghost" className="ml-auto text-red-600" disabled={pending} onClick={() => run(() => removeMember(groupId, k.成員ID))}>
                  移出小組
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="加入組員">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋孩子姓名、家長或電話（只列出同基地的孩子）" />
        {q.trim() && results.length === 0 && <p className="mt-3 text-sm text-gray-500">沒有符合的孩子</p>}
        <div className="mt-2 divide-y">
          {results.map((k) => (
            <div key={k.成員ID} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-semibold">{k.姓名}</span>
              <span className="text-sm text-gray-500">{k.年級}</span>
              <span className="text-sm text-gray-500">
                {k.家長} {k.電話}
              </span>
              {k.目前小組 && <Badge tone="amber">目前在 {k.目前小組}</Badge>}
              <Button size="sm" className="ml-auto" disabled={pending} onClick={() => run(() => addMember(groupId, k.成員ID))}>
                {k.目前小組 ? '換到這個小組' : '加入'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
