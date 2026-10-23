import type { GroupMemberTable, GroupTable, RowOf } from './tables';

export const GroupType = { Team: '小隊', Course: '課程' } as const;
export type GroupType = (typeof GroupType)[keyof typeof GroupType];
export const GROUP_TYPES: GroupType[] = [GroupType.Team, GroupType.Course];

/** 分組成員角色：隊員/學員為被帶領者，其餘為負責人 */
export const GroupRole = { Member: '隊員', Student: '學員', Leader: '小隊長', Teacher: '老師', Assistant: '助理' } as const;
export const LEARNER_ROLES: string[] = [GroupRole.Member, GroupRole.Student];

export type Group = RowOf<typeof GroupTable>;
export type GroupMember = RowOf<typeof GroupMemberTable>;

export const isActiveGroup = (g: Group) => g.狀態 !== '停用';

export function sortGroups(groups: Group[]): Group[] {
  return [...groups].sort(
    (a, b) =>
      (Number(a.排序) || 1e9) - (Number(b.排序) || 1e9) ||
      a.名稱.localeCompare(b.名稱, 'zh-Hant', { numeric: true }),
  );
}

export function groupsOfType(groups: Group[], type: GroupType, includeInactive = false): Group[] {
  return sortGroups(groups.filter((g) => g.類型 === type && (includeInactive || isActiveGroup(g))));
}

export function membersOfGroup(members: GroupMember[], 分組ID: string, roles: string[] = LEARNER_ROLES): GroupMember[] {
  return members.filter((m) => m.分組ID === 分組ID && roles.includes(m.角色));
}

/** 各分組的被帶領人數（隊員/學員）；可傳入要排除的報名ID（例如已取消） */
export function groupCounts(members: GroupMember[], type?: GroupType, excludeRegIds?: Set<string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of members) {
    if (type && m.類型 !== type) continue;
    if (!LEARNER_ROLES.includes(m.角色)) continue;
    if (excludeRegIds && m.報名ID && excludeRegIds.has(m.報名ID)) continue;
    counts.set(m.分組ID, (counts.get(m.分組ID) ?? 0) + 1);
  }
  return counts;
}

/** 帳號擔任負責人（非隊員/學員）的分組ID */
export function leaderGroupIds(members: GroupMember[], account: string): string[] {
  return members.filter((m) => m.成員ID === account && !LEARNER_ROLES.includes(m.角色)).map((m) => m.分組ID);
}

/** 每位成員所屬某類型分組的 分組ID 清單 */
export function groupIdsByMember(members: GroupMember[], type: GroupType): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const m of members) {
    if (m.類型 !== type || !LEARNER_ROLES.includes(m.角色)) continue;
    map.set(m.成員ID, [...(map.get(m.成員ID) ?? []), m.分組ID]);
  }
  return map;
}
