'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { Alert, Card, buttonClass, withBase } from '@kids/ui';
import { importAllMembers, importGroups } from '@/lib/actions';

/** 匯入／匯出卡片：members＝所有小組組員（小組點名頁）；groups＝小組設定（小組設定頁） */
export function SheetImport({ kind }: { kind: 'members' | 'groups' }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [report, setReport] = useState<{ text: string; problems: string[] } | null>(null);
  const [pending, startTransition] = useTransition();

  const importFile = (file: File) =>
    startTransition(async () => {
      setError('');
      setReport(null);
      try {
        // CSV 以 UTF-8 文字讀取（直接讀位元組會把中文欄位名稱解錯）
        const wb = /\.csv$/i.test(file.name) ? XLSX.read((await file.text()).replace(/^﻿/, ''), { type: 'string' }) : XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const rows = XLSX.utils
          .sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
          .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), String(v ?? '').trim()])));
        if (!rows.some((r) => r.小組名稱)) return setError('檔案裡沒有「小組名稱」欄位的資料，請先下載範例表');
        if (kind === 'members') {
          const res = await importAllMembers(rows.map((r) => ({ 小組名稱: r.小組名稱 ?? '', 姓名: r.姓名 ?? '', 家長電話: r.家長電話 ?? '', 成員ID: r.成員ID ?? '' })));
          if (res.error) return setError(res.error);
          setReport({ text: `新加入 ${res.added ?? 0} 位${res.already ? `，${res.already} 位原本就在小組` : ''}`, problems: res.problems ?? [] });
        } else {
          const res = await importGroups(rows);
          if (res.error) return setError(res.error);
          setReport({ text: `新增 ${res.added ?? 0} 個小組、更新 ${res.updated ?? 0} 個`, problems: res.problems ?? [] });
        }
        router.refresh();
      } catch {
        setError('無法讀取這個檔案，請使用 Excel（.xlsx）或 CSV');
      }
    });

  const exportHref = kind === 'members' ? '/export/members' : '/settings/export';
  return (
    <Card title="匯入／匯出">
      <div className="flex flex-wrap items-center gap-2">
        <a href={withBase(exportHref)} download className={buttonClass('secondary', 'sm')}>
          {kind === 'members' ? '匯出全部組員' : '匯出小組設定'}
        </a>
        {kind === 'members' ? (
          <a href={withBase('/export/members?template=1')} download className={buttonClass('ghost', 'sm')}>
            下載範例表
          </a>
        ) : (
          <a href={withBase(exportHref)} download className={buttonClass('ghost', 'sm')}>
            下載範例表（目前的小組）
          </a>
        )}
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
      <p className="mt-2 text-xs text-gray-500">
        {kind === 'members'
          ? '每列一位孩子，用「小組名稱」分到各小組；依「姓名＋家長電話」或「成員ID」找到家庭資料裡的孩子。檔案裡沒有的組員不會被移出。'
          : '依「小組名稱」新增或更新小組；負責人填帳號，以逗號分隔。檔案裡沒有的小組不會被刪除或停用。'}
      </p>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
      {report && (
        <div className="mt-3 space-y-2">
          <Alert tone={report.problems.length ? 'amber' : 'green'}>
            {report.text}
            {report.problems.length > 0 && `，${report.problems.length} 筆需要確認`}
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
  );
}
