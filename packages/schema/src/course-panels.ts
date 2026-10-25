/** 家長頁「課程分組」卡片（角落活動、歡樂小站…）的對象與內容；存在活動的「分組說明」欄位 */
export interface CoursePanelText {
  對象: string;
  內容: string;
}

export type CoursePanels = Record<string, CoursePanelText>;

export function parseCoursePanels(json: string | undefined | null): CoursePanels {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as CoursePanels) : {};
  } catch {
    return {};
  }
}

/** 依課程的「課程分組」整理出卡片順序：照課程排序第一次出現的順序；沒有分組名稱的課程歸在「課程」 */
export function courseGroupNames(courses: { 課程分組?: string }[]): string[] {
  return [...new Set(courses.map((c) => c.課程分組?.trim() || '課程'))];
}
