export interface BoardRow {
  報名ID: string;
  序號: string;
  成員ID: string;
  姓名: string;
  性別: string;
  年級: string;
  小隊: string;
  區域: string;
  報名狀態: string;
  報名類型: string;
  課程: string[];
  家長: string;
  電話: string;
  特殊需求: string;
  /** 此模式（一般 / 某課程）的報到紀錄 */
  報到狀態: string;
  報到時間: string;
  晚到: boolean;
  已聯繫: boolean;
}

export interface Board {
  eventName: string;
  courses: string[];
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
}

export interface SlotInfo {
  小隊: string;
  區域: string;
  current?: { 時間: string; 地點: string; 內容: string };
  next?: { 時間: string; 地點: string; 內容: string };
}
