/**
 * 活動頁上方的三行資訊：時間、地點、活動報到／繳費時間。
 * 存進活動的「活動時間」「地點」「報到時間」欄位的是家長看到的完整文字（例如 10/18(日)上午9:30-11:30），
 * 編輯時再拆回日期與時段。不能有 'use server'（頁面與 Server Action 都會用）。
 */

export const TIME_PRESETS = ['上午9:30-11:30', '上午9:45-11:40', '上午10:00-11:30'] as const;
export const VENUE_PRESETS = ['屏東和平教會(屏東市民族路399號)'] as const;
export const CHECKIN_PRESETS = ['上午09:15~09:25', '上午9:30-9:40', '上午09:40-09:55'] as const;
export const CHECKIN_SUFFIX = '(課程當天報到時繳費)';
/** radio 選「其他」時的值 */
export const OTHER = 'other';

const WEEK = '日一二三四五六';

/** "2026-10-18" → "10/18(日)"；格式不對回傳空字串 */
export function dateLabel(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${m[2]}/${m[3]}(${WEEK[d.getDay()]})`;
}

export interface DatedValue {
  /** YYYY-MM-DD；拆不出日期時為空 */
  date: string;
  /** 連續活動的結束日期（YYYY-MM-DD）；單日活動為空 */
  endDate?: string;
  /** 預設時段之一，或 OTHER */
  choice: string;
  /** 選「其他」時輸入的文字 */
  other: string;
  /** 結尾括號內的說明（報到時間的「(課程當天報到時繳費)」） */
  suffix: string;
}

/**
 * 把存起來的文字拆回表單值：「10/18(日)上午9:30-11:30」→ 日期＋時段。
 * 年份取自活動開始日期（顯示格式沒有年份）。
 */
export function parseDated(value: string, presets: readonly string[], year: string, withSuffix = false): DatedValue {
  // 單日「10/18(日)上午…」或連續「10/18(日)~10/20(二)上午…」
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\([日一二三四五六]\)(?:~(\d{1,2})\/(\d{1,2})\([日一二三四五六]\))?\s*(.*)$/);
  let rest = m ? m[5] : value.trim();
  let suffix = '';
  if (withSuffix) {
    const s = rest.match(/^(.*?)(\([^()]*\))$/);
    if (s) [, rest, suffix] = s;
  }
  const ymd = (mm: string, dd: string) => `${year}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  const ok = m && /^\d{4}$/.test(year);
  const date = ok ? ymd(m[1], m[2]) : '';
  // 結束月份比開始小表示跨年
  const endDate = ok && m[3] ? (Number(m[3]) < Number(m[1]) ? `${Number(year) + 1}` : year) + `-${m[3].padStart(2, '0')}-${m[4].padStart(2, '0')}` : '';
  const choice = !rest ? presets[0] : presets.includes(rest) ? rest : OTHER;
  return { date, endDate, choice, other: choice === OTHER ? rest : '', suffix };
}

/** 表單值組回家長看到的文字；時段沒填就回傳空字串（家長頁不顯示這一行） */
export function formatDated(date: string, time: string, suffix = '', endDate = ''): string {
  const t = time.trim();
  if (!t) return '';
  const range = endDate && endDate !== date && dateLabel(endDate) ? `~${dateLabel(endDate)}` : '';
  return `${dateLabel(date)}${range}${t}${suffix.trim()}`;
}

/** 新活動預設的時間與地點（活動日期＝開始日期，時段與地點取第一個預設） */
export function defaultEventInfo(startDate: string) {
  return {
    活動時間: formatDated(startDate, TIME_PRESETS[0]),
    地點: VENUE_PRESETS[0],
    報到時間: formatDated(startDate, CHECKIN_PRESETS[0], CHECKIN_SUFFIX),
  };
}

/** 課程分組卡片的預設對象與內容（尚未儲存過的分組會先帶入，可再修改） */
export const COURSE_PANEL_DEFAULTS: Record<string, { 對象: string; 內容: string }> = {
  角落活動: { 對象: '滿3.5歲~6歲學齡前兒童', 內容: '角落活動、詩歌唱跳、聖經品格教育、小組團體建造、禱告祝福' },
  歡樂小站: { 對象: '國小一年級~六年級兒童', 內容: '歡樂小站、詩歌唱跳、聖經品格教育、小組團體建造、禱告祝福' },
};
