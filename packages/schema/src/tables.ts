/**
 * 所有系統共用的資料契約：每個分頁的名稱與標題列。
 * 程式一律依「標題名稱」讀寫，不依欄位位置；Sheet 上可自由調整欄位順序或加欄。
 *
 * owner：唯一可以「新增列」的系統；其他系統只能讀，或只更新 updatableBy 列出的欄位。
 */

export type SystemName = 'registration' | 'checkin' | 'rollcall' | 'admin' | 'data-tools';

export interface TableDef<H extends string = string> {
  /** 分頁名稱 */
  tab: string;
  /** 主鍵欄位（每列唯一 ID） */
  idColumn: H;
  headers: readonly H[];
  owner: SystemName;
  /** 其他系統可更新的欄位 */
  updatableBy?: Partial<Record<SystemName, readonly H[]>>;
}

function defineTable<const H extends string>(def: TableDef<H>): TableDef<H> {
  return def;
}

// ───────── 主資料試算表（跨活動共用，GOOGLE_MASTER_SHEET_ID） ─────────

export const HouseholdTable = defineTable({
  tab: '家庭',
  idColumn: '家庭ID',
  headers: ['家庭ID', '主要聯絡人', '電話', 'Email', '地址', '建立時間', '更新時間'],
  owner: 'registration',
  updatableBy: { admin: ['主要聯絡人', '電話', 'Email', '地址', '更新時間'] },
});

export const MemberTable = defineTable({
  tab: '成員',
  idColumn: '成員ID',
  headers: [
    '成員ID', '家庭ID', '姓名', '性別', '生日', '年級', '學校',
    '類型', '特殊需求', '建立時間', '更新時間',
  ],
  owner: 'registration',
  updatableBy: {
    admin: ['姓名', '性別', '生日', '年級', '學校', '類型', '特殊需求', '更新時間'],
    checkin: ['特殊需求', '更新時間'], // 第一次報到補資料
  },
});

export const AccountTable = defineTable({
  tab: '帳號',
  idColumn: '帳號',
  headers: ['帳號', '名稱', '密碼雜湊', '角色', '可管理活動', '小隊', '啟用'],
  owner: 'admin',
});

export const EventTable = defineTable({
  tab: '活動',
  idColumn: '活動ID',
  headers: [
    '活動ID', '名稱', '版本', '活動試算表', '開始日期', '結束日期',
    '報名開放', '報名截止', '報名規則', '狀態', '備註',
  ],
  owner: 'admin',
});

// ───────── 活動試算表（每場活動一份，連結記在「活動」分頁） ─────────

export const RegistrationTable = defineTable({
  tab: '報名',
  idColumn: '報名ID',
  headers: [
    '報名ID', '成員ID', '家庭ID', '姓名', '年級', '報名類型', '課程',
    '狀態', '來源', '報名時間', '備註',
  ],
  owner: 'registration',
  updatableBy: {
    admin: ['狀態', '備註'],
  },
});

export const CheckInTable = defineTable({
  tab: '報到',
  idColumn: '報到ID',
  headers: [
    '報到ID', '報名ID', '成員ID', '姓名', '課程', '報到時間', '方式',
    '操作者', '晚到', '已聯繫', '狀態',
  ],
  owner: 'checkin',
});

export const TeamTable = defineTable({
  tab: '小隊',
  idColumn: '小隊成員ID',
  headers: ['小隊成員ID', '小隊', '成員ID', '姓名', '角色', '區域'],
  owner: 'data-tools',
  updatableBy: { admin: ['小隊', '角色', '區域'] },
});

export const ScheduleTable = defineTable({
  tab: '時間表',
  idColumn: '時段ID',
  headers: ['時段ID', '小隊', '日期', '開始', '結束', '地點', '內容'],
  owner: 'admin',
});

export const AttendanceTable = defineTable({
  tab: '點名',
  idColumn: '點名ID',
  headers: ['點名ID', '時段ID', '小隊', '成員ID', '姓名', '狀態', '操作者', '時間', '備註'],
  owner: 'rollcall',
});

export const SurveyTable = defineTable({
  tab: '問卷',
  idColumn: '問卷ID',
  headers: ['問卷ID', '標題', '題目JSON', '對象', '開放', '截止', '狀態'],
  owner: 'admin',
});

export const SurveyResponseTable = defineTable({
  tab: '問卷回覆',
  idColumn: '回覆ID',
  headers: ['回覆ID', '問卷ID', '家庭ID', '成員ID', '答案JSON', '時間'],
  owner: 'registration',
});

export const LogTable = defineTable({
  tab: '日誌',
  idColumn: '日誌ID',
  headers: ['日誌ID', '時間', '系統', '操作者', '動作', '對象ID', '內容'],
  owner: 'admin', // 例外：所有系統都可 append
});

export const MASTER_TABLES = [HouseholdTable, MemberTable, AccountTable, EventTable] as const;
export const EVENT_TABLES = [
  RegistrationTable, CheckInTable, TeamTable, ScheduleTable,
  AttendanceTable, SurveyTable, SurveyResponseTable, LogTable,
] as const;

/** 由 TableDef 推導出列的型別：{ 標題: 字串值 } */
export type RowOf<T extends TableDef> = Record<T['headers'][number], string>;
