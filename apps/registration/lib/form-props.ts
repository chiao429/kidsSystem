import 'server-only';
import { EventVersion, GRADE_OPTIONS, MemberType, gradeRank } from '@kids/schema';
import { countCourses } from './eligibility';
import type { EventInfo } from './events';
import { registrations } from './tables';
import type { CourseOption } from './types';

export async function formProps(event: EventInfo) {
  const r = event.rules;
  const grades = GRADE_OPTIONS.filter(
    (g) =>
      (!r.minGrade || gradeRank(g) >= gradeRank(r.minGrade)) && (!r.maxGrade || gradeRank(g) <= gradeRank(r.maxGrade)),
  );
  const counts = countCourses(await registrations(event.sheetId).all());
  const courses: CourseOption[] = (r.courses ?? []).map((c) => ({
    name: c.name,
    full: !!c.capacity && (counts.get(c.name) ?? 0) >= c.capacity,
  }));
  return {
    eventId: event.活動ID,
    grades: [...grades],
    courses,
    defaultType: event.版本 === EventVersion.Adult ? MemberType.Adult : MemberType.Child,
  };
}
