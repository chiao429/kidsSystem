import 'server-only';
import { GroupType, LEARNER_ROLES, groupsOfType, type Group, type GroupMember } from '@kids/schema';
import { groupMembers, groups } from './tables';

/** 活動的分組與分組成員，以及常用的對照 */
export async function loadGroupState(eventId: string, fresh = false) {
  const [gg, gm] = await Promise.all([groups(eventId).all({ fresh }), groupMembers(eventId).all({ fresh })]);
  const byId = new Map<string, Group>(gg.map((g) => [g.分組ID, g]));
  const learners = gm.filter((m) => LEARNER_ROLES.includes(m.角色));
  const coursesOf = (報名ID: string, 成員ID = ''): GroupMember[] =>
    learners.filter((m) => m.類型 === GroupType.Course && (m.報名ID === 報名ID || (!m.報名ID && 成員ID && m.成員ID === 成員ID)));
  const courseNames = (報名ID: string, 成員ID = '') =>
    coursesOf(報名ID, 成員ID).map((m) => byId.get(m.分組ID)?.名稱 ?? '').filter(Boolean).join('、');
  const teamOf = (成員ID: string): Group | undefined => {
    const m = learners.find((x) => x.類型 === GroupType.Team && x.成員ID === 成員ID);
    return m ? byId.get(m.分組ID) : undefined;
  };
  return {
    groups: gg,
    members: gm,
    byId,
    courses: groupsOfType(gg, GroupType.Course, true),
    teams: groupsOfType(gg, GroupType.Team, true),
    coursesOf,
    courseNames,
    teamOf,
  };
}
