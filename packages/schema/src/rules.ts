import type { GroupType } from './groups';

/** 「活動.報名規則」欄位的 JSON 格式 */
export interface EventRules {
  /** 此活動啟用的分組類型；未設定為 ['小隊'] */
  groupTypes?: GroupType[];
  /** 可報名的最低/最高年級（GRADE_OPTIONS 之一），空白表示不限 */
  minGrade?: string;
  maxGrade?: string;
  /** 總名額，0 或空白表示不限；額滿後轉備取 */
  capacity?: number;
  /**
   * @deprecated 舊格式：課程已改存在「分組」表，僅搬遷時讀取
   */
  courses?: { name: string; capacity?: number }[];
  /** @deprecated 舊格式：grouping 'course' 等同 groupTypes ['課程'] */
  grouping?: 'team' | 'course';
  /** 自動正取（否則為待審核） */
  autoAccept?: boolean;
  /** 只開放既有家庭報名 */
  existingOnly?: boolean;
}

export function parseRules(json: string | undefined | null): EventRules {
  if (!json) return { groupTypes: ['小隊'] };
  try {
    const v = JSON.parse(json);
    const rules = v && typeof v === 'object' ? (v as EventRules) : {};
    if (!rules.groupTypes?.length) rules.groupTypes = rules.grouping === 'course' ? ['課程'] : ['小隊'];
    return rules;
  } catch {
    return { groupTypes: ['小隊'] };
  }
}

export const hasGroupType = (rules: EventRules, type: GroupType) => (rules.groupTypes ?? ['小隊']).includes(type);

export function splitList(value: string | undefined | null): string[] {
  return String(value ?? '')
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const EventStatus = { Draft: '草稿', Open: '開放報名', Closed: '截止報名', Running: '進行中', Ended: '已結束' } as const;
