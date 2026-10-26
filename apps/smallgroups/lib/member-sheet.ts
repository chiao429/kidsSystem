/** 小組組員匯入／匯出的 Excel 欄位（伺服器與瀏覽器共用） */
export const MEMBER_COLUMNS = ['姓名', '年級', '家長', '家長電話', '成員ID'] as const;

/** 匯入時的一列：成員ID 有填就直接比對；沒有就用姓名＋家長電話（或只有姓名且唯一）找孩子 */
export interface ImportRow {
  姓名: string;
  家長電話: string;
  成員ID: string;
}
