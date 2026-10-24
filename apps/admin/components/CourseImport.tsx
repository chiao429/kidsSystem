'use client';

import { useState, useTransition } from 'react';
import * as XLSX from 'xlsx';
import { Alert, Button, Card, Table } from '@kids/ui';
import { applyCourseImport, previewCourseImport, type CourseImportRow } from '@/lib/course-import';

type Preview = Awaited<ReturnType<typeof previewCourseImport>>['preview'][number];

export function CourseImport({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<CourseImportRow[]>([]);
  const [preview, setPreview] = useState<Preview[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  const read = async (file: File) => {
    setError('');
    setMessage('');
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<CourseImportRow>(sheet, { defval: '' });
      if (parsed.length === 0) throw new Error('檔案沒有資料列');
      setRows(parsed);
      const checked = await previewCourseImport(eventId, parsed);
      setPreview(checked.preview);
      if (checked.errors.length) setError(checked.errors.join('；'));
    } catch (e) {
      setRows([]);
      setPreview([]);
      setError(e instanceof Error ? e.message : '無法讀取檔案');
    }
  };

  const submit = () => startTransition(async () => {
    setError('');
    setMessage('');
    const result = await applyCourseImport(eventId, rows);
    if (result.error) setError(result.error);
    else setMessage(result.message ?? '匯入完成');
  });

  return (
    <Card title="匯入課程">
      <div className="space-y-3">
        <p className="text-sm text-gray-600">上傳 Excel 或 CSV 後先預覽，確認後才會寫入。相同課程代碼會更新原課程，未出現的課程不會刪除。</p>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
        {error && <Alert tone="red">{error}</Alert>}
        {message && <Alert tone="green">{message}</Alert>}
        {preview.length > 0 && (
          <>
            <Table head={['列', '課程', '代碼', '分組', '名額', '材料費', '狀態']}>
              {preview.map((p) => (
                <tr key={p.line}>
                  <td className="px-2 py-1">{p.line}</td>
                  <td className="px-2 py-1">{p.row.名稱}</td>
                  <td className="px-2 py-1">{p.row.代碼}</td>
                  <td className="px-2 py-1">{p.row.課程分組}</td>
                  <td className="px-2 py-1">{p.row.名額}</td>
                  <td className="px-2 py-1">{p.row.材料費}</td>
                  <td className={`px-2 py-1 ${p.errors.length ? 'text-red-700' : 'text-gray-600'}`}>{p.errors.join('、') || p.action}</td>
                </tr>
              ))}
            </Table>
            <Button variant="primary" disabled={pending} onClick={submit}>{pending ? '匯入中…' : '確認匯入'}</Button>
          </>
        )}
      </div>
    </Card>
  );
}
