/** 「活動.報名規則」欄位的 JSON 格式 */
export interface EventRules {
  /** 可報名的最低/最高年級（GRADE_OPTIONS 之一），空白表示不限 */
  minGrade?: string;
  maxGrade?: string;
  /** 總名額，0 或空白表示不限；額滿後轉備取 */
  capacity?: number;
  /** 可選課程；空陣列表示沒有課程選項 */
  courses?: { name: string; capacity?: number }[];
  /** 自動正取（否則為待審核） */
  autoAccept?: boolean;
  /** 只開放既有家庭報名 */
  existingOnly?: boolean;
}

export function parseRules(json: string | undefined | null): EventRules {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? (v as EventRules) : {};
  } catch {
    return {};
  }
}

export function splitList(value: string | undefined | null): string[] {
  return String(value ?? '')
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const EventStatus = { Draft: '草稿', Open: '開放報名', Closed: '截止報名', Running: '進行中', Ended: '已結束' } as const;
