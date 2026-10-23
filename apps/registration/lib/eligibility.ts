import 'server-only';
import {
  GroupType, RegistrationStatus, groupCounts, groupsOfType, gradeRank, hasGroupType,
  type EventRules, type Group, type GroupMember, type RegistrationTable, type RowOf,
} from '@kids/schema';
import { groupMembers, groups } from './tables';

type Registration = RowOf<typeof RegistrationTable>;

export const isActive = (r: Registration) => r.狀態 !== RegistrationStatus.Cancelled;

/** 此活動可選的課程（啟用中的課程分組）；活動未啟用課程時為空 */
export function availableCourses(rules: EventRules, allGroups: Group[]): Group[] {
  return hasGroupType(rules, GroupType.Course) ? groupsOfType(allGroups, GroupType.Course) : [];
}

/** 單一成員的資格檢查，回傳錯誤訊息（null 表示通過）；member.courses 為課程分組ID */
export function checkMember(
  member: { 成員ID?: string; 姓名: string; 年級: string; courses: string[] },
  rules: EventRules,
  existing: Registration[],
  courses: Group[],
  courseCounts: Map<string, number>,
): string | null {
  const name = member.姓名 || '（未填姓名）';
  const rank = gradeRank(member.年級);
  if (rules.minGrade && rank < gradeRank(rules.minGrade)) return `${name}：年級需為${rules.minGrade}以上`;
  if (rules.maxGrade && rank > gradeRank(rules.maxGrade)) return `${name}：年級需為${rules.maxGrade}以下`;
  if (member.成員ID && existing.some((r) => r.成員ID === member.成員ID && isActive(r))) return `${name}：已經報名過此活動`;
  for (const id of member.courses) {
    const g = courses.find((x) => x.分組ID === id);
    if (!g) return `${name}：選擇的課程不存在或已停止報名`;
    const cap = Number(g.名額) || 0;
    if (cap && (courseCounts.get(id) ?? 0) >= cap) return `${name}：課程「${g.名稱}」已額滿`;
  }
  if (courses.length > 0 && member.courses.length === 0) return `${name}：請至少選擇一門課程`;
  return null;
}

/** 各課程目前人數（不含已取消的報名） */
export function countCourses(existing: Registration[], gm: GroupMember[]): Map<string, number> {
  const cancelled = new Set(existing.filter((r) => !isActive(r)).map((r) => r.報名ID));
  return groupCounts(gm, GroupType.Course, cancelled);
}

export async function loadCourseState(eventId: string, rules: EventRules, existing: Registration[], fresh = false) {
  const [gg, gm] = await Promise.all([groups(eventId).all({ fresh }), groupMembers(eventId).all({ fresh })]);
  return { courses: availableCourses(rules, gg), counts: countCourses(existing, gm), groups: gg, members: gm };
}

export function nextSerial(existing: Registration[]): number {
  return existing.reduce((max, r) => Math.max(max, Number(r.序號) || 0), 0) + 1;
}

export function initialStatus(rules: EventRules, activeCount: number): string {
  if (!rules.autoAccept) return RegistrationStatus.Pending;
  if (rules.capacity && activeCount >= rules.capacity) return RegistrationStatus.Waitlist;
  return RegistrationStatus.Accepted;
}
