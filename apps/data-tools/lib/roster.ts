import 'server-only';
import {
  GRADE_GROUP_ORDER,
  GroupRole,
  GroupType,
  LEARNER_ROLES,
  RegistrationStatus,
  baseOf,
  isTestHousehold,
  gradeGroup,
  type BaseName,
  gradeRank,
  siblingTitle,
} from '@kids/schema';
import { groupMembers, groups, households, members, registrations } from './tables';

export interface Sibling {
  姓名: string;
  性別: string;
  年級: string;
  稱謂: string;
  序號: string;
  小隊: string;
}

export interface Kid {
  報名ID: string;
  序號: string;
  成員ID: string;
  家庭ID: string;
  姓名: string;
  性別: string;
  年級: string;
  組別: string;
  /** 思麥特（國小）｜夢夢（學齡前） */
  基地: BaseName;
  學校: string;
  家長: string;
  電話: string;
  特殊需求: string;
  課程: string;
  狀態: string;
  小隊ID: string;
  小隊: string;
  siblings: Sibling[];
}

/** 參加名單：報名 × 成員 × 家庭，手足依「家庭ID」判斷（只列同活動有報名的手足） */
/** excludeTest：排除測試家庭（匯出報表用；分隊時仍包含，方便測試點名） */
export async function loadRoster(eventId: string, opts: { statuses?: string[]; excludeTest?: boolean } = {}): Promise<Kid[]> {
  const statuses = opts.statuses ?? [RegistrationStatus.Accepted];
  const [regs, mm, hh, gg, gm] = await Promise.all([
    registrations(eventId).all(),
    members().all(),
    households().all(),
    groups(eventId).all(),
    groupMembers(eventId).all(),
  ]);
  const memberById = new Map(mm.map((m) => [m.成員ID, m]));
  const householdById = new Map(hh.map((h) => [h.家庭ID, h]));
  const groupById = new Map(gg.map((g) => [g.分組ID, g]));
  const teamByMember = new Map(
    gm.filter((m) => m.類型 === GroupType.Team && m.角色 === GroupRole.Member).map((m) => [m.成員ID, groupById.get(m.分組ID)]),
  );
  const coursesByReg = new Map<string, string[]>();
  for (const m of gm) {
    if (m.類型 !== GroupType.Course || !LEARNER_ROLES.includes(m.角色)) continue;
    const name = groupById.get(m.分組ID)?.名稱;
    if (name) coursesByReg.set(m.報名ID || m.成員ID, [...(coursesByReg.get(m.報名ID || m.成員ID) ?? []), name]);
  }

  const kids: Kid[] = regs
    .filter((r) => statuses.includes(r.狀態))
    .filter((r) => !opts.excludeTest || !isTestHousehold(householdById.get(r.家庭ID) ?? {}))
    .map((r) => {
      const m = memberById.get(r.成員ID);
      const h = householdById.get(r.家庭ID);
      const 年級 = m?.年級 || r.年級;
      return {
        報名ID: r.報名ID,
        序號: r.序號,
        成員ID: r.成員ID,
        家庭ID: r.家庭ID,
        姓名: r.姓名,
        性別: m?.性別 ?? '',
        年級,
        組別: gradeGroup(年級),
        基地: baseOf(年級),
        學校: m?.學校 ?? '',
        家長: h?.主要聯絡人 ?? '',
        電話: h?.電話 ?? '',
        特殊需求: m?.特殊需求 ?? '',
        課程: (coursesByReg.get(r.報名ID) ?? coursesByReg.get(r.成員ID) ?? []).join('、'),
        狀態: r.狀態,
        小隊ID: teamByMember.get(r.成員ID)?.分組ID ?? '',
        小隊: teamByMember.get(r.成員ID)?.名稱 ?? '',
        siblings: [],
      };
    });

  const byHousehold = new Map<string, Kid[]>();
  for (const k of kids) byHousehold.set(k.家庭ID, [...(byHousehold.get(k.家庭ID) ?? []), k]);
  for (const k of kids) {
    k.siblings = (byHousehold.get(k.家庭ID) ?? [])
      .filter((s) => s.成員ID !== k.成員ID)
      .sort((a, b) => gradeRank(b.年級) - gradeRank(a.年級))
      .map((s) => ({
        姓名: s.姓名,
        性別: s.性別,
        年級: s.年級,
        稱謂: siblingTitle(k.年級, s.年級, s.性別),
        序號: s.序號,
        小隊: s.小隊,
      }));
  }
  return kids.sort((a, b) => (Number(a.序號) || 1e9) - (Number(b.序號) || 1e9));
}

export function groupByGrade(kids: Kid[]): { group: string; kids: Kid[] }[] {
  const order = [...GRADE_GROUP_ORDER];
  const groups = new Map<string, Kid[]>();
  for (const k of kids) groups.set(k.組別, [...(groups.get(k.組別) ?? []), k]);
  return [...groups.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([group, list]) => ({
      group,
      // 學齡前：依年級（未就學→大班）再依序號
      kids: [...list].sort((a, b) => gradeRank(a.年級) - gradeRank(b.年級) || (Number(a.序號) || 0) - (Number(b.序號) || 0)),
    }));
}

export function siblingText(k: Kid): string {
  return k.siblings.map((s) => `${s.姓名}（${s.稱謂}, ${s.年級}${s.小隊 ? `, ${s.小隊}` : ''}）`).join('、');
}
