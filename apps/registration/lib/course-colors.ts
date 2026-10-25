/** 課程分組的代表色：報名頁的分組卡片色條與報名表課程卡片的小圓點共用，同一分組同一個顏色 */
const GROUP_COLORS = ['#ff8a00', '#4aa8ff', '#3ddc84', '#ff54bb', '#ffd400'];

/** 依分組在整場活動課程中的出現順序配色 */
export function groupColor(groups: string[], group: string): string {
  return GROUP_COLORS[Math.max(groups.indexOf(group), 0) % GROUP_COLORS.length];
}
