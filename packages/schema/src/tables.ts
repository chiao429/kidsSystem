/**
 * 所有系統共用的資料契約：每個分頁的名稱與標題列。
 * 程式一律依「標題名稱」讀寫，不依欄位位置；Sheet 上可自由調整欄位順序或加欄。
 *
 * owner：唯一可以「新增列」的系統；其他系統只能讀，或只更新 updatableBy 列出的欄位。
 */

export type SystemName = 'registration' | 'checkin' | 'rollcall' | 'admin' | 'data-tools' | 'smallgroups';

/** 依某欄位的值決定擁有者，例如「類型」= 課程 → admin、registration */
export interface OwnerByColumn<H extends string = string> {
  byColumn: H;
  owners: Record<string, readonly SystemName[]>;
}

export interface TableDef<H extends string = string> {
  /** 分頁名稱 */
  tab: string;
  /** 資料庫 collection 名稱 */
  key: string;
  /** master：主資料（跨活動）；event：每場活動一份 */
  scope: 'master' | 'event';
  /** 主鍵欄位（每列唯一 ID） */
  idColumn: H;
  headers: readonly H[];
  owner: SystemName | OwnerByColumn<H>;
  /** 其他系統可更新的欄位 */
  updatableBy?: Partial<Record<SystemName, readonly H[]>>;
  /** owner 以外可以刪除列（不能新增）的系統 */
  deletableBy?: readonly SystemName[];
  /** 主鍵以外的唯一鍵（同一 scope 內） */
  uniqueKeys?: readonly (readonly H[])[];
  /** 可在 Google Sheet 上修改並寫回資料庫的欄位（可含 displayColumns） */
  sheetEditable?: readonly string[];
  /** 只出現在 Sheet 鏡像、不存資料庫的計算欄位 */
  displayColumns?: readonly string[];
  /** 不可推送到 Sheet 的欄位 */
  mirrorExclude?: readonly H[];
}

/** 判斷 actor 是否為這一列的擁有者 */
export function isOwner(def: TableDef, actor: SystemName, row?: Record<string, string | undefined>): boolean {
  if (typeof def.owner === 'string') return def.owner === actor;
  const value = row?.[def.owner.byColumn] ?? '';
  return (def.owner.owners[value] ?? []).includes(actor);
}

function defineTable<const H extends string>(def: TableDef<H>): TableDef<H> {
  return def;
}

// ───────── 主資料試算表（跨活動共用，GOOGLE_MASTER_SHEET_ID） ─────────

export const HouseholdTable = defineTable({
  tab: '家庭',
  key: 'households',
  scope: 'master',
  idColumn: '家庭ID',
  // PIN：家長登入時以手機＋4 位數 PIN 帶入資料；連續錯誤會暫時鎖定
  // 測試＝Y：工作人員測試用的家庭，可以正常報名、報到，但不納入報表、統計與匯出
  headers: ['家庭ID', '主要聯絡人', '電話', 'Email', '地址', '建立時間', '更新時間', 'PIN雜湊', 'PIN錯誤次數', 'PIN鎖定至', '測試'],
  owner: 'registration',
  // admin 可重設 PIN（清空後家長用孩子生日驗證再設定）、標記測試家庭
  updatableBy: { admin: ['主要聯絡人', '電話', 'Email', '地址', '更新時間', 'PIN雜湊', 'PIN錯誤次數', 'PIN鎖定至', '測試'] },
  sheetEditable: ['主要聯絡人', '電話', 'Email', '地址'],
  mirrorExclude: ['PIN雜湊', 'PIN錯誤次數', 'PIN鎖定至'],
  // 後台可刪除家庭（連同成員；有進行中的報名時由後台擋下）
  deletableBy: ['admin'],
});

/** 工作人員測試用的家庭（不納入報表、統計與匯出） */
export const isTestHousehold = (h: { 測試?: string }) => h.測試 === 'Y';

export const MemberTable = defineTable({
  tab: '成員',
  key: 'members',
  scope: 'master',
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
  // 後台可刪除孩子（有進行中的報名時由後台擋下）
  deletableBy: ['admin'],
  sheetEditable: ['姓名', '性別', '生日', '年級', '學校', '類型', '特殊需求'],
});

/**
 * 帳號：新帳號以手機號碼為帳號、預設密碼為手機號碼，第一次登入需改密碼（需改密碼 = Y）。
 * 角色：角色表的 角色ID。小隊：@deprecated 舊資料相容（以名稱比對分組）；新的負責人請在分組成員指派
 */
export const AccountTable = defineTable({
  tab: '帳號',
  key: 'accounts',
  scope: 'master',
  idColumn: '帳號',
  headers: ['帳號', '名稱', '密碼雜湊', '角色', '可管理活動', '小隊', '啟用', '需改密碼'],
  owner: 'admin',
  mirrorExclude: ['密碼雜湊'],
});

/** 角色與權限：權限為可使用的系統（逗號分隔），範圍見 RoleScope */
export const RoleTable = defineTable({
  tab: '角色',
  key: 'roles',
  scope: 'master',
  idColumn: '角色ID',
  headers: ['角色ID', '名稱', '權限', '範圍', '說明'],
  owner: 'admin',
});

export const EventTable = defineTable({
  tab: '活動',
  key: 'events',
  scope: 'master',
  idColumn: '活動ID',
  headers: [
    '活動ID', '名稱', '版本', '活動試算表', '開始日期', '結束日期',
    '活動時間', '地點', '報到時間', '繳費時間', '活動說明', '適用對象', '報名提醒',
    '報名開放', '報名截止', '報名規則', '狀態', '備註',
    // 家長頁活動說明下方的簽名檔：空白＝使用預設簽名檔；「無」＝不顯示；其餘為簽名檔ID
    '簽名檔',
    // 家長頁各課程分組卡片的對象與內容（JSON：{ "角落活動": { "對象": "...", "內容": "..." } }）
    '分組說明',
  ],
  owner: 'admin',
});

// ───────── 活動試算表（每場活動一份，連結記在「活動」分頁） ─────────

export const RegistrationTable = defineTable({
  tab: '報名',
  key: 'registrations',
  scope: 'event',
  idColumn: '報名ID',
  headers: [
    '報名ID', '序號', '成員ID', '家庭ID', '姓名', '年級', '報名類型',
    '狀態', '來源', '報名時間', '備註', '照片影片公開同意', '後續活動通知同意',
    // 繳費：現場報名時或報到時記錄（繳費狀態＝已繳｜空白）
    '繳費狀態', '繳費金額', '繳費時間', '收款人',
  ],
  owner: 'registration',
  updatableBy: {
    admin: ['狀態', '備註', '繳費狀態', '繳費金額', '繳費時間', '收款人'],
    checkin: ['繳費狀態', '繳費金額', '繳費時間', '收款人'],
  },
  sheetEditable: ['狀態', '備註'],
  /** 課程：由分組成員組出（例：美勞課、音樂課） */
  displayColumns: ['課程'],
});

export const CheckInTable = defineTable({
  tab: '報到',
  key: 'checkins',
  scope: 'event',
  idColumn: '報到ID',
  /** 分組ID 空白 = 一般報到；否則為該課程分組的報到 */
  headers: [
    '報到ID', '報名ID', '成員ID', '姓名', '分組ID', '報到時間', '方式',
    '操作者', '晚到', '已聯繫', '狀態',
  ],
  owner: 'checkin',
  uniqueKeys: [['報名ID', '分組ID']],
  displayColumns: ['分組名稱'],
});

/** 小隊與課程統一為「分組」 */
export const GroupTable = defineTable({
  tab: '分組',
  key: 'groups',
  scope: 'event',
  idColumn: '分組ID',
  headers: [
    '分組ID', '類型', '名稱', '代碼', '名額', '區域', '說明', '排序', '狀態',
    '課程分組', '適用對象', '最低年級', '最高年級', '最低年齡', '最高年齡', '材料費',
    '課程報名開始', '課程報名截止', '允許現場報名', '注意事項',
  ],
  owner: { byColumn: '類型', owners: { 課程: ['admin'], 小隊: ['data-tools', 'admin'] } },
  uniqueKeys: [['類型', '名稱']],
});

/** 每人每組一列；工作人員的成員ID 填帳號（沒有帳號可留白，以姓名區分） */
export const GroupMemberTable = defineTable({
  tab: '分組成員',
  key: 'groupMembers',
  scope: 'event',
  idColumn: '分組成員ID',
  headers: ['分組成員ID', '分組ID', '類型', '成員ID', '姓名', '報名ID', '角色', '來源', '建立時間'],
  owner: { byColumn: '類型', owners: { 課程: ['registration', 'admin'], 小隊: ['data-tools', 'admin'] } },
  uniqueKeys: [['分組ID', '成員ID', '姓名']],
  displayColumns: ['分組名稱'],
  sheetEditable: ['分組名稱', '角色'],
});

export const ScheduleTable = defineTable({
  tab: '時間表',
  key: 'schedules',
  scope: 'event',
  idColumn: '時段ID',
  /** 分組ID 空白 = 全部；此時分組類型（小隊｜課程｜空白）限定對象 */
  headers: ['時段ID', '分組ID', '分組類型', '日期', '開始', '結束', '地點', '內容'],
  owner: 'admin',
  displayColumns: ['分組名稱'],
});

export const AttendanceTable = defineTable({
  tab: '點名',
  key: 'attendance',
  scope: 'event',
  idColumn: '點名ID',
  headers: ['點名ID', '時段ID', '分組ID', '成員ID', '姓名', '狀態', '操作者', '時間', '備註'],
  owner: 'rollcall',
  uniqueKeys: [['時段ID', '分組ID', '成員ID']],
  displayColumns: ['分組名稱'],
});

export const SurveyTable = defineTable({
  tab: '問卷',
  key: 'surveys',
  scope: 'event',
  idColumn: '問卷ID',
  headers: ['問卷ID', '標題', '題目JSON', '對象', '開放', '截止', '狀態'],
  owner: 'admin',
});

export const SurveyResponseTable = defineTable({
  tab: '問卷回覆',
  key: 'surveyResponses',
  scope: 'event',
  idColumn: '回覆ID',
  headers: ['回覆ID', '問卷ID', '家庭ID', '成員ID', '答案JSON', '時間'],
  owner: 'registration',
});

export const LogTable = defineTable({
  tab: '日誌',
  key: 'logs',
  scope: 'event',
  idColumn: '日誌ID',
  headers: ['日誌ID', '時間', '系統', '操作者', '動作', '對象ID', '內容'],
  owner: 'admin', // 例外：所有系統都可 append
});

/** 簽名檔：顯示在家長頁活動說明下方的共用段落（提醒事項、粉專聯絡方式等），各活動可選用 */
export const SignatureTable = defineTable({
  tab: '簽名檔',
  key: 'signatures',
  scope: 'master',
  idColumn: '簽名檔ID',
  // 內容為消毒過的 HTML；預設 = 'Y' 的簽名檔用於沒有另外指定的活動（只會有一個）
  headers: ['簽名檔ID', '名稱', '內容', '預設', '排序', '更新時間'],
  owner: 'admin',
});

// ───────── 小組（長期、跨活動，每次聚會依日期點名） ─────────

/** 小組設定：基地＝思麥特｜夢夢；負責人為帳號（逗號分隔，同工只看得到自己負責的小組）；狀態＝啟用｜停用 */
export const SmallGroupTable = defineTable({
  tab: '小組',
  key: 'smallGroups',
  scope: 'master',
  idColumn: '小組ID',
  headers: ['小組ID', '名稱', '基地', '排序', '負責人', '狀態', '說明', '建立時間'],
  owner: 'smallgroups',
});

/** 小組成員：成員ID 對應家庭資料的孩子；離開日期空白＝目前在組（換組時保留紀錄） */
export const SmallGroupMemberTable = defineTable({
  tab: '小組成員',
  key: 'smallGroupMembers',
  scope: 'master',
  idColumn: '小組成員ID',
  headers: ['小組成員ID', '小組ID', '成員ID', '姓名', '加入日期', '離開日期', '來源'],
  owner: 'smallgroups',
});

/** 小組點名：每位孩子每次聚會（日期）一列；狀態空白＝未點；操作者「報到同步」表示由當天報到自動帶入 */
export const SmallGroupAttendanceTable = defineTable({
  tab: '小組點名',
  key: 'smallGroupAttendance',
  scope: 'master',
  idColumn: '小組點名ID',
  headers: ['小組點名ID', '小組ID', '成員ID', '姓名', '日期', '狀態', '當天狀況', '備註', '操作者', '時間'],
  owner: 'smallgroups',
  uniqueKeys: [['小組ID', '成員ID', '日期']],
});

export const MASTER_TABLES = [
  HouseholdTable, MemberTable, AccountTable, RoleTable, EventTable, SignatureTable,
  SmallGroupTable, SmallGroupMemberTable, SmallGroupAttendanceTable,
] as const;
export const EVENT_TABLES = [
  RegistrationTable, CheckInTable, GroupTable, GroupMemberTable, ScheduleTable,
  AttendanceTable, SurveyTable, SurveyResponseTable, LogTable,
] as const;
export const ALL_TABLES = [...MASTER_TABLES, ...EVENT_TABLES] as const;

/** 由 TableDef 推導出列的型別：{ 標題: 字串值 } */
export type RowOf<T extends TableDef> = Record<T['headers'][number], string>;
