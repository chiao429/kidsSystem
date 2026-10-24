/**
 * 課程欄位的共用處理（前端編輯器、Excel 匯入與 Server Action 都用這支，不能有 'use server'）。
 * 草稿的欄位名稱與「分組」表相同，存檔時可直接寫入。
 */
import type { Group } from '@kids/schema';

export const COURSE_FIELDS = [
  '名稱', '代碼', '名額', '課程分組', '適用對象', '最低年級', '最高年級', '最低年齡', '最高年齡',
  '材料費', '課程報名開始', '課程報名截止', '允許現場報名', '注意事項', '說明', '排序', '狀態',
] as const;
export type CourseField = (typeof COURSE_FIELDS)[number];
export type CourseDraft = Record<CourseField, string>;

/** 課程匯入檔的欄位 */
export const COURSE_IMPORT_HEADERS = [
  '課程分組', '適用對象', '課程名稱', '課程代碼', '最低年級', '最高年級', '最低年齡', '最高年齡',
  '名額', '材料費', '課程說明', '注意事項', '報名開始', '報名截止', '允許現場報名', '排序', '狀態',
] as const;

export const emptyCourse = (排序 = ''): CourseDraft => ({
  名稱: '', 代碼: '', 名額: '', 課程分組: '', 適用對象: '', 最低年級: '', 最高年級: '', 最低年齡: '', 最高年齡: '',
  材料費: '', 課程報名開始: '', 課程報名截止: '', 允許現場報名: 'Y', 注意事項: '', 說明: '', 排序, 狀態: '啟用',
});

export function courseFromGroup(g: Group): CourseDraft {
  const d = emptyCourse();
  for (const k of COURSE_FIELDS) d[k] = String((g as Record<string, unknown>)[k] ?? '');
  d.允許現場報名 = d.允許現場報名 === 'N' ? 'N' : 'Y';
  d.狀態 = d.狀態 || '啟用';
  return d;
}

const NO = ['否', 'no', 'n', 'false', '0'];

/** Excel／CSV 的一列轉成草稿（欄名見 COURSE_IMPORT_HEADERS，也接受分組表的欄名） */
export function courseFromImport(row: Record<string, unknown>): CourseDraft {
  const get = (...keys: string[]) => keys.map((k) => String(row[k] ?? '').trim()).find(Boolean) ?? '';
  return {
    名稱: get('課程名稱', '名稱'), 代碼: get('課程代碼', '代碼'), 名額: get('名額'), 課程分組: get('課程分組'), 適用對象: get('適用對象'),
    最低年級: get('最低年級'), 最高年級: get('最高年級'), 最低年齡: get('最低年齡'), 最高年齡: get('最高年齡'), 材料費: get('材料費'),
    課程報名開始: get('報名開始', '課程報名開始'), 課程報名截止: get('報名截止', '課程報名截止'),
    允許現場報名: NO.includes(get('允許現場報名').toLowerCase()) ? 'N' : 'Y',
    注意事項: get('注意事項'), 說明: get('課程說明', '說明'), 排序: get('排序'), 狀態: get('狀態') || '啟用',
  };
}

/** 去掉前後空白、數字正規化（例如 "15.0" → "15"）；無法解析的數字保留原字串讓驗證報錯 */
export function cleanCourse(d: CourseDraft): CourseDraft {
  const out = { ...d };
  for (const k of COURSE_FIELDS) out[k] = String(out[k] ?? '').trim();
  for (const k of ['名額', '材料費', '最低年齡', '最高年齡', '排序'] as const) {
    if (out[k] && Number.isFinite(Number(out[k]))) out[k] = String(Number(out[k]));
  }
  return out;
}

/** 驗證一批課程（含名稱是否重複）；回傳每一列的錯誤訊息，沒有錯誤的列為空陣列 */
export function validateCourses(drafts: CourseDraft[]): string[][] {
  const names = new Map<string, number>();
  const codes = new Map<string, number>();
  for (const d of drafts) {
    if (d.名稱) names.set(d.名稱, (names.get(d.名稱) ?? 0) + 1);
    if (d.代碼) codes.set(d.代碼, (codes.get(d.代碼) ?? 0) + 1);
  }
  return drafts.map((d) => {
    const e: string[] = [];
    if (!d.名稱) e.push('請填寫課程名稱');
    else if ((names.get(d.名稱) ?? 0) > 1) e.push('課程名稱重複');
    if (d.代碼 && (codes.get(d.代碼) ?? 0) > 1) e.push('課程代碼重複');
    for (const [k, integer] of [['名額', true], ['材料費', true], ['最低年齡', false], ['最高年齡', false], ['排序', true]] as const) {
      const v = d[k];
      if (!v) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) e.push(`${k}必須是非負${integer ? '整數' : '數字'}`);
    }
    if (d.最低年齡 && d.最高年齡 && Number(d.最低年齡) > Number(d.最高年齡)) e.push('最低年齡不可高於最高年齡');
    if (d.課程報名開始 && d.課程報名截止 && d.課程報名開始 > d.課程報名截止) e.push('報名截止不可早於開始');
    if (!['啟用', '停用'].includes(d.狀態)) e.push('狀態必須是啟用或停用');
    return e;
  });
}

export const sameCourse = (a: CourseDraft, b: CourseDraft) => COURSE_FIELDS.every((k) => (a[k] ?? '') === (b[k] ?? ''));
