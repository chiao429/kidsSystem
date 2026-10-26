/**
 * 活動範本的 Excel 格式（瀏覽器與伺服器共用，不能有 'server-only'）。
 * 工作表：活動（欄位／值）、課程（與課程頁匯入相同欄位）、小隊、時間表、問卷、說明。
 * 只有「課程」工作表的檔案（例如課程匯入檔）也可以當範本，活動設定改在表單填。
 */
import * as XLSX from 'xlsx';
import { COURSE_IMPORT_HEADERS, courseFromImport } from './course-fields';

type Rows = Record<string, string>[];

export interface TemplateData {
  format: 'kids-event-template';
  version: 1;
  exportedAt: string;
  event: Record<string, string>;
  rules: Record<string, unknown>;
  groups: Rows;
  schedules: Rows;
  surveys: Rows;
}

/** 「活動」工作表列出的欄位（報名規則以 JSON 文字存放） */
const EVENT_FIELDS = [
  '名稱', '開始日期', '結束日期', '報名開放', '報名截止', '活動時間', '地點', '報到時間', '繳費時間',
  '活動說明', '適用對象', '報名提醒', '備註', '簽名檔', '分組說明',
] as const;
const TEAM_HEADERS = ['名稱', '代碼', '名額', '區域', '說明', '排序', '狀態'] as const;
const SCHEDULE_HEADERS = ['分組名稱', '分組類型', '日期', '開始', '結束', '地點', '內容'] as const;
const SURVEY_HEADERS = ['標題', '題目JSON', '對象', '開放', '截止', '狀態'] as const;

/** 課程（分組表欄位）→ 課程匯入檔欄位 */
const COURSE_TO_IMPORT: Record<(typeof COURSE_IMPORT_HEADERS)[number], string> = {
  課程分組: '課程分組', 適用對象: '適用對象', 課程名稱: '名稱', 課程代碼: '代碼', 最低年級: '最低年級', 最高年級: '最高年級',
  最低年齡: '最低年齡', 最高年齡: '最高年齡', 名額: '名額', 材料費: '材料費', 課程說明: '說明', 注意事項: '注意事項',
  報名開始: '課程報名開始', 報名截止: '課程報名截止', 允許現場報名: '允許現場報名', 排序: '排序', 狀態: '狀態',
};

const sheetOf = (rows: (string | number)[][], widths?: number[]) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
};

export function templateToWorkbook(t: TemplateData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const groupName = new Map(t.groups.map((g) => [g.分組ID, g.名稱]));
  XLSX.utils.book_append_sheet(
    wb,
    sheetOf([['欄位', '值'], ...EVENT_FIELDS.map((f) => [f, t.event[f] ?? '']), ['報名規則', JSON.stringify(t.rules ?? {})]], [12, 80]),
    '活動',
  );
  const courses = t.groups.filter((g) => g.類型 === '課程');
  XLSX.utils.book_append_sheet(wb, sheetOf([[...COURSE_IMPORT_HEADERS], ...courses.map((g) => COURSE_IMPORT_HEADERS.map((h) => g[COURSE_TO_IMPORT[h]] ?? ''))]), '課程');
  const teams = t.groups.filter((g) => g.類型 === '小隊');
  XLSX.utils.book_append_sheet(wb, sheetOf([[...TEAM_HEADERS], ...teams.map((g) => TEAM_HEADERS.map((h) => g[h] ?? ''))]), '小隊');
  XLSX.utils.book_append_sheet(
    wb,
    sheetOf([[...SCHEDULE_HEADERS], ...t.schedules.map((s) => SCHEDULE_HEADERS.map((h) => (h === '分組名稱' ? groupName.get(s.分組ID) ?? '' : s[h] ?? '')))]),
    '時間表',
  );
  XLSX.utils.book_append_sheet(wb, sheetOf([[...SURVEY_HEADERS], ...t.surveys.map((s) => SURVEY_HEADERS.map((h) => s[h] ?? ''))]), '問卷');
  XLSX.utils.book_append_sheet(
    wb,
    sheetOf(
      [
        ['工作表', '說明'],
        ['活動', '活動設定與報名頁內容；在「新增活動」匯入時會帶入表單，日期與報名時間請再確認'],
        ['課程', '欄位與課程頁「匯入 Excel／CSV」相同'],
        ['小隊', '小隊名稱與區域（不含隊員）'],
        ['時間表', '「分組名稱」對應課程或小隊名稱；空白表示全部'],
        ['問卷', '題目JSON 請勿手動修改'],
      ],
      [10, 70],
    ),
    '說明',
  );
  return wb;
}

/** 讀取工作表成物件陣列（欄位名稱去掉前後空白） */
function rowsOf(wb: XLSX.WorkBook, name: string): Rows {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils
    .sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false })
    .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim(), String(v ?? '').trim()])));
}

/** Excel 範本 → 與 JSON 範本相同的資料；找不到可用內容時回傳錯誤訊息 */
export function workbookToTemplate(wb: XLSX.WorkBook): TemplateData | string {
  const event: Record<string, string> = {};
  let rules: Record<string, unknown> = {};
  for (const r of rowsOf(wb, '活動')) {
    if (!r.欄位) continue;
    if (r.欄位 === '報名規則') {
      try {
        rules = r.值 ? JSON.parse(r.值) : {};
      } catch {
        return '「活動」工作表的報名規則格式不正確';
      }
    } else event[r.欄位] = r.值 ?? '';
  }
  // 沒有「課程」工作表時，用第一個工作表當課程（例如只有課程的匯入檔）
  const courseRows = wb.Sheets['課程'] ? rowsOf(wb, '課程') : wb.Sheets['活動'] ? [] : rowsOf(wb, wb.SheetNames[0]);
  let seq = 0;
  const tmpId = () => `tmp-${++seq}`;
  const groups: Rows = [
    ...courseRows
      .map((r) => courseFromImport(r))
      .filter((d) => d.名稱)
      .map((d) => ({ 分組ID: tmpId(), 類型: '課程', 區域: '', ...d })),
    ...rowsOf(wb, '小隊')
      .filter((r) => r.名稱)
      .map((r) => ({ 分組ID: tmpId(), 類型: '小隊', ...Object.fromEntries(TEAM_HEADERS.map((h) => [h, r[h] ?? ''])), 狀態: r.狀態 || '啟用' })),
  ];
  const idByName = new Map(groups.map((g) => [g.名稱, g.分組ID]));
  const schedules: Rows = rowsOf(wb, '時間表')
    .filter((r) => r.日期)
    .map((r) => ({ 時段ID: tmpId(), 分組ID: r.分組名稱 ? idByName.get(r.分組名稱) ?? '' : '', 分組類型: r.分組類型 ?? '', 日期: r.日期, 開始: r.開始 ?? '', 結束: r.結束 ?? '', 地點: r.地點 ?? '', 內容: r.內容 ?? '' }));
  const surveys: Rows = rowsOf(wb, '問卷')
    .filter((r) => r.標題)
    .map((r) => ({ 問卷ID: tmpId(), ...Object.fromEntries(SURVEY_HEADERS.map((h) => [h, r[h] ?? ''])) }));
  // 沒有報名規則（例如只有課程的檔案）：依內容決定使用的分組，避免預設成只有小隊
  if (!Array.isArray(rules.groupTypes)) {
    rules = { ...rules, groupTypes: [...(groups.some((g) => g.類型 === '小隊') ? ['小隊'] : []), ...(groups.some((g) => g.類型 === '課程') || groups.length === 0 ? ['課程'] : [])] };
  }
  if (Object.keys(event).length === 0 && groups.length === 0) return '檔案裡沒有活動或課程資料（請用「匯出範本」或課程匯入範本的格式）';
  return { format: 'kids-event-template', version: 1, exportedAt: '', event, rules, groups, schedules, surveys };
}
