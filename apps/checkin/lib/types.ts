import type { GroupType } from '@kids/schema';

export interface BoardRow {
  報名ID: string;
  序號: string;
  成員ID: string;
  家庭ID: string;
  姓名: string;
  性別: string;
  年級: string;
  小隊ID: string;
  小隊: string;
  區域: string;
  報名狀態: string;
  報名類型: string;
  課程: { 分組ID: string; 名稱: string }[];
  家長: string;
  電話: string;
  特殊需求: string;
  /** 此模式（一般 / 某課程）的報到紀錄 */
  報到狀態: string;
  報到時間: string;
  晚到: boolean;
  已聯繫: boolean;
}

export interface GroupInfo {
  分組ID: string;
  類型: GroupType;
  名稱: string;
  區域: string;
  說明: string;
}

export interface Board {
  eventName: string;
  groupTypes: GroupType[];
  groups: GroupInfo[];
  /** 目前的課程分組ID；空白為一般報到 */
  course: string;
  rows: BoardRow[];
  updatedAt: string;
}

export interface ActionResult {
  ok?: boolean;
  error?: string;
  /** 需要工作人員確認（例如備取者報到） */
  confirm?: string;
  message?: string;
  /** 之前已經報到過（這次沒有再寫入） */
  already?: boolean;
}

/** 掃描或點選後要處理的孩子；enrolled：課程報到時是否有報名此課程 */
export interface ScanRow extends BoardRow {
  enrolled: boolean;
}

export interface CheckInOutcome {
  報名ID: string;
  status: 'done' | 'already' | 'error';
  message: string;
}

export interface SlotInfo {
  分組ID: string;
  類型: GroupType;
  名稱: string;
  區域: string;
  current?: { 時間: string; 地點: string; 內容: string };
  next?: { 時間: string; 地點: string; 內容: string };
}
