import 'server-only';
import { RegistrationStatus, gradeRank, type EventRules, type RegistrationTable, type RowOf } from '@kids/schema';

type Registration = RowOf<typeof RegistrationTable>;

export const isActive = (r: Registration) => r.狀態 !== RegistrationStatus.Cancelled;

/** 單一成員的資格檢查，回傳錯誤訊息（null 表示通過） */
export function checkMember(
  member: { 成員ID?: string; 姓名: string; 年級: string; courses: string[] },
  rules: EventRules,
  existing: Registration[],
  courseCounts: Map<string, number>,
): string | null {
  const name = member.姓名 || '（未填姓名）';
  const rank = gradeRank(member.年級);
  if (rules.minGrade && rank < gradeRank(rules.minGrade)) return `${name}：年級需為${rules.minGrade}以上`;
  if (rules.maxGrade && rank > gradeRank(rules.maxGrade)) return `${name}：年級需為${rules.maxGrade}以下`;
  if (member.成員ID && existing.some((r) => r.成員ID === member.成員ID && isActive(r))) return `${name}：已經報名過此活動`;
  for (const c of member.courses) {
    const def = rules.courses?.find((x) => x.name === c);
    if (!def) return `${name}：課程「${c}」不存在`;
    if (def.capacity && (courseCounts.get(c) ?? 0) >= def.capacity) return `${name}：課程「${c}」已額滿`;
  }
  if ((rules.courses?.length ?? 0) > 0 && member.courses.length === 0) return `${name}：請至少選擇一門課程`;
  return null;
}

export function countCourses(existing: Registration[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of existing.filter(isActive)) {
    for (const c of r.課程.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  return counts;
}

export function nextSerial(existing: Registration[]): number {
  return existing.reduce((max, r) => Math.max(max, Number(r.序號) || 0), 0) + 1;
}

export function initialStatus(rules: EventRules, activeCount: number): string {
  if (!rules.autoAccept) return RegistrationStatus.Pending;
  if (rules.capacity && activeCount >= rules.capacity) return RegistrationStatus.Waitlist;
  return RegistrationStatus.Accepted;
}
