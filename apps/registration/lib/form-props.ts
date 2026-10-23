import 'server-only';
import { EventVersion, GRADE_OPTIONS, MemberType, gradeRank } from '@kids/schema';
import { loadCourseState } from './eligibility';
import type { EventInfo } from './events';
import { registrations } from './tables';
import type { CourseOption } from './types';

export async function formProps(event: EventInfo) {
  const r = event.rules;
  const grades = GRADE_OPTIONS.filter(
    (g) =>
      (!r.minGrade || gradeRank(g) >= gradeRank(r.minGrade)) && (!r.maxGrade || gradeRank(g) <= gradeRank(r.maxGrade)),
  );
  const { courses: list, counts } = await loadCourseState(event.活動ID, r, await registrations(event.活動ID).all());
  const courses: CourseOption[] = list.map((c) => {
    const cap = Number(c.名額) || 0;
    const count = counts.get(c.分組ID) ?? 0;
    return { id: c.分組ID, name: c.名稱, full: !!cap && count >= cap, remaining: cap ? Math.max(cap - count, 0) : null };
  });
  return {
    eventId: event.活動ID,
    grades: [...grades],
    courses,
    defaultType: event.版本 === EventVersion.Adult ? MemberType.Adult : MemberType.Child,
  };
}
