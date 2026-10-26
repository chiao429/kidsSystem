/** 小組組員匯入／匯出的 Excel 欄位（伺服器與瀏覽器共用） */
export const MEMBER_COLUMNS = ['姓名', '年級', '家長', '家長電話', '成員ID'] as const;

/** 匯入時的一列：成員ID 有填就直接比對；沒有就用姓名＋家長電話（或只有姓名且唯一）找孩子 */
export interface ImportRow {
  姓名: string;
  家長電話: string;
  成員ID: string;
}

/** 全部小組組員匯入／匯出：多一個「小組名稱」欄 */
export const ALL_MEMBER_COLUMNS = ['小組名稱', ...MEMBER_COLUMNS] as const;

/** 小組設定匯入／匯出的欄位；負責人填帳號（逗號分隔） */
export const GROUP_COLUMNS = ['小組名稱', '基地', '排序', '狀態', '說明', '負責人帳號'] as const;
