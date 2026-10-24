'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { Alert, Badge, Button, Field, Input, Select, Textarea, buttonClass, withBase } from '@kids/ui';
import { saveCourses } from '@/lib/course-actions';
import { courseFromImport, emptyCourse, sameCourse, validateCourses, type CourseDraft, type CourseField } from '@/lib/course-fields';

export interface CourseInitial {
  id: string;
  draft: CourseDraft;
  /** 已選這門課的學員數（不含已取消的報名） */
  learners: number;
  /** 有任何學員紀錄（含已取消）就不能刪除，與伺服器的規則一致 */
  locked: boolean;
}

interface Row {
  key: string;
  id?: string;
  draft: CourseDraft;
  /** 儲存在資料庫的版本（新增的課程沒有） */
  saved?: CourseDraft;
  learners: number;
  locked: boolean;
  deleted: boolean;
}

const toRows = (initial: CourseInitial[]): Row[] =>
  initial.map((c) => ({ key: c.id, id: c.id, draft: c.draft, saved: c.draft, learners: c.learners, locked: c.locked, deleted: false }));

const rowState = (r: Row) => (r.deleted ? 'deleted' : !r.id ? 'new' : r.saved && !sameCourse(r.draft, r.saved) ? 'changed' : 'clean');

let newKey = 0;

/** 課程頁：在畫面上新增、修改、刪除或匯入課程，按「全部儲存」才一次寫入 */
export function CourseEditor({ eventId, initial, grades }: { eventId: string; initial: CourseInitial[]; grades: string[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [serverErrors, setServerErrors] = useState<Map<string, string[]>>(new Map());
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty = rows.filter((r) => rowState(r) !== 'clean');
  const live = rows.filter((r) => !r.deleted);
  // 即時檢查（名稱重複、數字格式）；送出後伺服器回傳的錯誤也併入顯示
  const errors = useMemo(() => {
    const list = validateCourses(live.map((r) => r.draft));
    const map = new Map(live.map((r, i) => [r.key, list[i]]));
    for (const [k, v] of serverErrors) map.set(k, [...new Set([...(map.get(k) ?? []), ...v])]);
    return map;
  }, [live, serverErrors]);
  const hasErrors = dirty.some((r) => !r.deleted && (errors.get(r.key)?.length ?? 0) > 0);

  // 儲存後伺服器資料更新：沒有未儲存的變更時才換成新資料
  useEffect(() => {
    setRows((current) => (current.some((r) => rowState(r) !== 'clean') ? current : toRows(initial)));
  }, [initial]);

  // 有未儲存變更時，關閉或重新整理頁面前提醒
  useEffect(() => {
    if (dirty.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty.length]);

  const update = (key: string, field: CourseField, value: string) => {
    setMessage('');
    setServerErrors((m) => (m.has(key) ? new Map([...m].filter(([k]) => k !== key)) : m));
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, draft: { ...r.draft, [field]: value } } : r)));
  };
  const toggleOpen = (key: string) => setOpen((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key])));

  const addCourse = () => {
    const key = `new-${++newKey}`;
    setRows((rs) => [...rs, { key, draft: emptyCourse(), learners: 0, locked: false, deleted: false }]);
    setOpen((s) => new Set([...s, key]));
  };

  const remove = (r: Row) => {
    setMessage('');
    if (!r.id) setRows((rs) => rs.filter((x) => x.key !== r.key));
    else setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, deleted: !x.deleted } : x)));
  };

  const discard = () => {
    if (!window.confirm(`確定放棄 ${dirty.length} 筆未儲存的變更？`)) return;
    setRows(toRows(initial));
    setServerErrors(new Map());
    setError('');
    setMessage('');
  };

  /** 匯入：相同代碼（沒有代碼時相同名稱）的課程更新內容，其餘新增；都先放在畫面上等待儲存 */
  const importFile = async (file: File) => {
    setError('');
    setMessage('');
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const imported = XLSX.utils
        .sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
        .map(courseFromImport)
        .filter((d) => d.名稱 && d.名稱 !== '欄位說明');
      if (imported.length === 0) throw new Error('檔案裡沒有課程資料');
      let added = 0;
      let updated = 0;
      setRows((rs) => {
        const next = [...rs];
        for (const d of imported) {
          const i = next.findIndex((r) => !r.deleted && (d.代碼 ? r.draft.代碼 === d.代碼 : r.draft.名稱 === d.名稱));
          if (i >= 0) {
            next[i] = { ...next[i], draft: { ...d, 排序: d.排序 || next[i].draft.排序 } };
            updated++;
          } else {
            next.push({ key: `new-${++newKey}`, draft: d, learners: 0, locked: false, deleted: false });
            added++;
          }
        }
        return next;
      });
      setMessage(`已帶入 ${imported.length} 筆（新增 ${added}、更新 ${updated}），確認內容後按「全部儲存」才會寫入`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '無法讀取檔案');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const saveAll = () =>
    startTransition(async () => {
      setError('');
      setMessage('');
      const upsertRows = rows.filter((r) => !r.deleted && rowState(r) !== 'clean');
      const result = await saveCourses(eventId, {
        upserts: upsertRows.map((r) => ({ id: r.id, draft: r.draft })),
        deletes: rows.filter((r) => r.deleted && r.id).map((r) => r.id!),
      });
      if (result.error) {
        setError(result.error);
        const map = new Map<string, string[]>();
        result.rowErrors?.forEach((e, i) => e.length && map.set(upsertRows[i].key, e));
        setServerErrors(map);
        setOpen((s) => new Set([...s, ...map.keys()]));
        return;
      }
      setServerErrors(new Map());
      // 先把目前畫面標成已儲存，再向伺服器取最新資料（新課程的 ID、排序）
      setRows((rs) => rs.filter((r) => !r.deleted).map((r) => ({ ...r, saved: r.draft, id: r.id ?? r.key })));
      setMessage(result.message ?? '已儲存');
      router.refresh();
    });

  const gradeOptions = (current: string) => (current && !grades.includes(current) ? [current, ...grades] : grades);

  return (
    <div className="space-y-3">
      {/* 儲存列：捲動時固定在上方 */}
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <span className="text-sm font-semibold text-gray-800">課程（{live.length}）</span>
        {dirty.length > 0 ? (
          <Badge tone="amber">{dirty.length} 筆未儲存</Badge>
        ) : (
          <span className="text-xs text-gray-500">所有變更都已儲存</span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={addCourse}>
            ＋ 新增課程
          </Button>
          <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
            匯入 Excel／CSV
          </Button>
          <a href={withBase(`/events/${eventId}/groups/template`)} className={buttonClass('ghost', 'sm')}>
            下載匯入範本
          </a>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
          {dirty.length > 0 && (
            <Button variant="ghost" size="sm" onClick={discard} disabled={pending}>
              放棄變更
            </Button>
          )}
          <Button size="sm" onClick={saveAll} disabled={pending || dirty.length === 0 || hasErrors}>
            {pending ? '儲存中…' : '全部儲存'}
          </Button>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {message && <Alert tone="green">{message}</Alert>}

      {rows.length === 0 && <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-gray-500">尚未建立課程，按「新增課程」或匯入 Excel。</p>}

      {rows.map((r) => {
        const state = rowState(r);
        const rowErrors = r.deleted ? [] : (errors.get(r.key) ?? []);
        const isOpen = open.has(r.key);
        const d = r.draft;
        const field = (k: CourseField) => ({ value: d[k], onChange: (e: { target: { value: string } }) => update(r.key, k, e.target.value) });
        return (
          <section
            key={r.key}
            className={`rounded-2xl border bg-white transition ${
              state === 'deleted' ? 'border-red-200 opacity-60' : rowErrors.length ? 'border-red-300' : state === 'clean' ? 'border-gray-200' : 'border-amber-300 shadow-[0_0_0_3px_rgba(251,191,36,0.15)]'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <button type="button" onClick={() => toggleOpen(r.key)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="text-gray-400">{isOpen ? '▾' : '▸'}</span>
                <span className={`truncate font-semibold ${r.deleted ? 'line-through' : ''}`}>{d.名稱 || '（未命名課程）'}</span>
                {d.課程分組 && <span className="text-xs text-gray-500">{d.課程分組}</span>}
                <span className="text-xs text-gray-500">
                  {[d.最低年級 || d.最高年級 ? `${d.最低年級 || '不限'}～${d.最高年級 || '不限'}` : '', d.名額 ? `名額 ${d.名額}` : '名額不限', r.id ? `已選 ${r.learners} 人` : '']
                    .filter(Boolean)
                    .join('｜')}
                </span>
              </button>
              {d.狀態 === '停用' && <Badge tone="gray">停用</Badge>}
              {state === 'new' && <Badge tone="blue">新增</Badge>}
              {state === 'changed' && <Badge tone="amber">已修改</Badge>}
              {state === 'deleted' && <Badge tone="red">將刪除</Badge>}
              {rowErrors.length > 0 && <Badge tone="red">需修正</Badge>}
              {r.locked && !r.deleted ? (
                <span className="text-xs text-gray-400" title="已有學員的課程不能刪除，請改成停用">
                  無法刪除
                </span>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => remove(r)} className={r.deleted ? '' : 'text-red-600'}>
                  {r.deleted ? '復原' : '刪除'}
                </Button>
              )}
            </div>
            {rowErrors.length > 0 && <p className="px-4 pb-2 text-sm text-red-600">{rowErrors.join('；')}</p>}
            {isOpen && !r.deleted && (
              <div className="grid gap-3 border-t border-gray-100 px-4 py-4 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Field label="課程名稱" required>
                    <Input {...field('名稱')} />
                  </Field>
                </div>
                <Field label="課程分組" hint="例如：角落活動、歡樂小站">
                  <Input {...field('課程分組')} />
                </Field>
                <Field label="適用對象" hint="顯示給家長看">
                  <Input {...field('適用對象')} placeholder="學齡前" />
                </Field>
                <Field label="最低年級">
                  <Select {...field('最低年級')}>
                    <option value="">不限</option>
                    {gradeOptions(d.最低年級).map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="最高年級">
                  <Select {...field('最高年級')}>
                    <option value="">不限</option>
                    {gradeOptions(d.最高年級).map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="最低年齡" hint="歲，可空白">
                  <Input type="number" min={0} step="0.1" {...field('最低年齡')} />
                </Field>
                <Field label="最高年齡" hint="歲，可空白">
                  <Input type="number" min={0} step="0.1" {...field('最高年齡')} />
                </Field>
                <Field label="名額" hint="空白表示不限">
                  <Input type="number" min={0} {...field('名額')} />
                </Field>
                <Field label="材料費" hint="元">
                  <Input type="number" min={0} {...field('材料費')} />
                </Field>
                <Field label="報名開始" hint="空白跟活動一樣">
                  <Input type="datetime-local" {...field('課程報名開始')} />
                </Field>
                <Field label="報名截止" hint="空白跟活動一樣">
                  <Input type="datetime-local" {...field('課程報名截止')} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="注意事項" hint="顯示在家長選課的卡片上">
                    <Textarea rows={2} {...field('注意事項')} />
                  </Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="課程說明">
                    <Textarea rows={2} {...field('說明')} />
                  </Field>
                </div>
                <Field label="代碼" hint="跨活動比較用，可空白">
                  <Input {...field('代碼')} />
                </Field>
                <Field label="排序" hint="數字小的排前面">
                  <Input type="number" min={0} {...field('排序')} />
                </Field>
                <Field label="狀態">
                  <Select {...field('狀態')}>
                    <option>啟用</option>
                    <option>停用</option>
                  </Select>
                </Field>
                <label className="flex items-center gap-2 pt-6 text-sm">
                  <input type="checkbox" checked={d.允許現場報名 !== 'N'} onChange={(e) => update(r.key, '允許現場報名', e.target.checked ? 'Y' : 'N')} />
                  允許現場報名
                </label>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
