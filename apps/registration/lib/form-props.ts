import 'server-only';
import { EventVersion, GRADE_OPTIONS, GroupType, MemberType, gradeRank, groupsOfType } from '@kids/schema';
import { parseTaipei } from './events';
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
  const courseGroups = groupsOfType(list, GroupType.Course);
  const now = new Date();
  const courses: CourseOption[] = courseGroups.map((c) => {
    const cap = Number(c.名額) || 0;
    const count = counts.get(c.分組ID) ?? 0;
    const start = c.課程報名開始 || event.報名開放;
    const end = c.課程報名截止 || event.報名截止;
    const startDate = parseTaipei(start);
    const endDate = parseTaipei(end);
    return {
      id: c.分組ID,
      name: c.名稱,
      full: !!cap && count >= cap,
      remaining: cap ? Math.max(cap - count, 0) : null,
      groupName: c.課程分組 || c.適用對象 || '',
      audience: c.適用對象 || '',
      minGrade: c.最低年級 || '',
      maxGrade: c.最高年級 || '',
      minAge: c.最低年齡 ? Number(c.最低年齡) : null,
      maxAge: c.最高年齡 ? Number(c.最高年齡) : null,
      fee: Number(c.材料費) || 0,
      description: c.說明 || '',
      notice: c.注意事項 || '',
      registrationStart: start,
      registrationEnd: end,
      registrationState: startDate && now < startDate ? 'upcoming' : endDate && now > endDate ? 'closed' : 'open',
      allowOnSite: !['n', '否', 'false', '0'].includes((c.允許現場報名 || 'y').toLowerCase()),
    };
  });
  return {
    eventId: event.活動ID,
    grades: [...grades],
    courses,
    maxCoursesPerMember: r.maxCoursesPerMember ?? 0,
    allowOnSiteCourseRegistration: r.allowOnSiteCourseRegistration ?? true,
    defaultType: event.版本 === EventVersion.Adult ? MemberType.Adult : MemberType.Child,
  };
}
