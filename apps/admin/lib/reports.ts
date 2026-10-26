import 'server-only';
import { BASES, CheckInStatus, LEARNER_ROLES, RegistrationStatus, baseOf, gradeGroup, groupBaseOf, isTestHousehold, GRADE_GROUP_ORDER } from '@kids/schema';

/** 思麥特在前、夢夢在後 */
const baseIndex = (b: string) => BASES.findIndex((x) => x.short === b);
import { loadGroupState } from './groups';
import { attendance, checkIns, households, logs, members, registrations, schedules } from './tables';

const PRESENT = ['出席', '遲到'];

/** 可匯出的資料集與欄位 */
export const DATASETS = {
  roster: {
    label: '報名名單（含家庭、小隊、報到）',
    columns: ['基地', '序號', '姓名', '性別', '生日', '年級', '學校', '家長', '電話', 'Email', '地址', '特殊需求', '課程分組', '課程', '材料費', '應收費用', '照片影片公開同意', '後續活動通知同意', '報名狀態', '報名類型', '來源', '報名時間', '小隊', '報到狀態', '報到時間', '晚到', '已聯繫'],
  },
  groupMembers: {
    label: '分組成員明細（每人每組一列，適合樞紐分析）',
    columns: ['活動', '基地', '分組類型', '分組名稱', '代碼', '姓名', '性別', '年級', '學校', '角色', '報名狀態', '一般報到', '該組報到', '出席次數', '應出席時段數', '出席率'],
  },
  groupStats: { label: '分組統計', columns: ['基地', '分組類型', '分組名稱', '代碼', '名額', '報名數', '報到數', '點名人次', '出席人次', '平均出席率'] },
  checkins: { label: '報到紀錄', columns: ['姓名', '報到對象', '狀態', '報到時間', '方式', '操作者', '晚到', '已聯繫'] },
  attendance: { label: '點名紀錄', columns: ['基地', '日期', '時段', '內容', '分組類型', '分組', '姓名', '狀態', '備註', '操作者', '時間'] },
  logs: { label: '操作日誌', columns: ['時間', '系統', '操作者', '動作', '對象ID', '內容'] },
} as const;

export type DatasetKey = keyof typeof DATASETS;

/** 測試家庭（工作人員測試帳號）的報名與成員：報表、統計與匯出都排除 */
async function testScope(eventId: string) {
  const [hh, mm, regs] = await Promise.all([households().all(), members().all(), registrations(eventId).all()]);
  const families = new Set(hh.filter(isTestHousehold).map((h) => h.家庭ID));
  return {
    regIds: new Set(regs.filter((r) => families.has(r.家庭ID)).map((r) => r.報名ID)),
    memberIds: new Set(mm.filter((m) => families.has(m.家庭ID)).map((m) => m.成員ID)),
  };
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '');

export async function buildDataset(eventId: string, key: DatasetKey, eventName = ''): Promise<Record<string, string>[]> {
  const [state, test] = await Promise.all([loadGroupState(eventId), testScope(eventId)]);
  const notTestMember = (成員ID: string) => !test.memberIds.has(成員ID);
  const groupLabel = (id: string) => state.byId.get(id)?.名稱 ?? '';
  if (key === 'roster') {
    const [regs, mm, hh, cc] = await Promise.all([
      registrations(eventId).all(),
      members().all(),
      households().all(),
      checkIns(eventId).all(),
    ]);
    const m = new Map(mm.map((x) => [x.成員ID, x]));
    const h = new Map(hh.map((x) => [x.家庭ID, x]));
    const c = new Map(cc.filter((x) => !x.分組ID).map((x) => [x.報名ID, x]));
    return regs
      .filter((r) => !test.regIds.has(r.報名ID))
      // 依基地分開（思麥特在前），再依序號
      .sort(
        (a, b) =>
          baseIndex(baseOf(m.get(a.成員ID)?.年級 || a.年級)) - baseIndex(baseOf(m.get(b.成員ID)?.年級 || b.年級)) ||
          (Number(a.序號) || 1e9) - (Number(b.序號) || 1e9),
      )
      .map((r) => {
        const mem = m.get(r.成員ID);
        const hou = h.get(r.家庭ID);
        const ci = c.get(r.報名ID);
        const courseMembers = state.coursesOf(r.報名ID, r.成員ID);
        const fees = courseMembers.map((x) => Number(state.byId.get(x.分組ID)?.材料費) || 0);
        const courseGroups = courseMembers.map((x) => state.byId.get(x.分組ID)?.課程分組 ?? '').filter(Boolean);
        return {
          基地: baseOf(mem?.年級 || r.年級),
          序號: r.序號,
          姓名: r.姓名,
          性別: mem?.性別 ?? '',
          年級: mem?.年級 || r.年級,
          學校: mem?.學校 ?? '',
          生日: mem?.生日 ?? '',
          家長: hou?.主要聯絡人 ?? '',
          電話: hou?.電話 ?? '',
          Email: hou?.Email ?? '',
          地址: hou?.地址 ?? '',
          特殊需求: mem?.特殊需求 ?? '',
          課程分組: [...new Set(courseGroups)].join('、'),
          課程: state.courseNames(r.報名ID, r.成員ID),
          材料費: fees.filter(Boolean).join('、'),
          應收費用: String(fees.reduce((sum, fee) => sum + fee, 0)),
          照片影片公開同意: r.照片影片公開同意,
          後續活動通知同意: r.後續活動通知同意,
          報名狀態: r.狀態,
          報名類型: r.報名類型,
          來源: r.來源,
          報名時間: r.報名時間,
          小隊: state.teamOf(r.成員ID)?.名稱 ?? '',
          報到狀態: ci?.狀態 ?? '',
          報到時間: ci?.報到時間 ?? '',
          晚到: ci?.晚到 ?? '',
          已聯繫: ci?.已聯繫 ?? '',
        };
      });
  }
  if (key === 'checkins') {
    return (await checkIns(eventId).all()).filter((c) => !test.regIds.has(c.報名ID)).map((c) => ({ ...c, 報到對象: c.分組ID ? groupLabel(c.分組ID) : '一般報到' }));
  }
  if (key === 'logs') return (await logs(eventId).all()) as unknown as Record<string, string>[];
  const [allAttendance, ss] = await Promise.all([attendance(eventId).all(), schedules(eventId).all()]);
  const aa = allAttendance.filter((a) => notTestMember(a.成員ID));
  const slot = new Map(ss.map((s) => [s.時段ID, s]));
  const realState = { ...state, members: state.members.filter((m) => notTestMember(m.成員ID) && !(m.報名ID && test.regIds.has(m.報名ID))) };
  if (key === 'groupMembers' || key === 'groupStats') return buildGroupDatasets(eventId, key, eventName, realState, aa, ss);
  const baseOfGroup = groupBases(state);
  return aa.map((a) => {
    const s = slot.get(a.時段ID);
    return {
      基地: baseOfGroup.get(a.分組ID) ?? '',
      日期: s?.日期 ?? a.時段ID.replace('DAY-', ''),
      時段: s ? `${s.開始}-${s.結束}` : '整日',
      內容: s?.內容 ?? '',
      分組類型: state.byId.get(a.分組ID)?.類型 ?? '',
      分組: groupLabel(a.分組ID),
      姓名: a.姓名,
      狀態: a.狀態,
      備註: a.備註,
      操作者: a.操作者,
      時間: a.時間,
    };
  });
}

type GroupState = Awaited<ReturnType<typeof loadGroupState>>;

/** 各分組所屬基地：課程看年級限制，小隊看成員年級 */
function groupBases(state: GroupState, gradeOf: (成員ID: string) => string = () => '') {
  return new Map(
    state.groups.map((g) => [
      g.分組ID,
      groupBaseOf(
        g,
        state.members.filter((m) => m.分組ID === g.分組ID && LEARNER_ROLES.includes(m.角色)).map((m) => gradeOf(m.成員ID)).filter(Boolean),
      ),
    ]),
  );
}

/** 分組成員明細與分組統計：以分組成員為主，串報名、成員、報到、點名 */
async function buildGroupDatasets(
  eventId: string,
  key: 'groupMembers' | 'groupStats',
  eventName: string,
  state: GroupState,
  aa: Awaited<ReturnType<ReturnType<typeof attendance>['all']>>,
  ss: Awaited<ReturnType<ReturnType<typeof schedules>['all']>>,
): Promise<Record<string, string>[]> {
  const [regs, mm, cc] = await Promise.all([registrations(eventId).all(), members().all(), checkIns(eventId).all()]);
  const regById = new Map(regs.map((r) => [r.報名ID, r]));
  const regByMember = new Map(regs.map((r) => [r.成員ID, r]));
  const memberById = new Map(mm.map((m) => [m.成員ID, m]));
  const checkin = (報名ID: string, 分組ID: string) => cc.find((c) => c.報名ID === 報名ID && c.分組ID === 分組ID)?.狀態 ?? '';
  // 應出席時段：時間表中屬於該分組（含全部、全部同類型）的時段，加上實際有點名的整日時段
  const baseOfGroup = groupBases(state, (id) => memberById.get(id)?.年級 || regByMember.get(id)?.年級 || '');
  const slotsOf = (分組ID: string, 類型: string) => {
    const ids = new Set(ss.filter((s) => s.分組ID === 分組ID || (!s.分組ID && (!s.分組類型 || s.分組類型 === 類型))).map((s) => s.時段ID));
    for (const a of aa) if (a.分組ID === 分組ID) ids.add(a.時段ID);
    return ids.size;
  };

  const rows = state.members.map((m) => {
    const g = state.byId.get(m.分組ID);
    const reg = (m.報名ID && regById.get(m.報名ID)) || regByMember.get(m.成員ID);
    const mem = memberById.get(m.成員ID);
    const mine = aa.filter((a) => a.分組ID === m.分組ID && a.成員ID === m.成員ID);
    const present = mine.filter((a) => PRESENT.includes(a.狀態)).length;
    const expected = LEARNER_ROLES.includes(m.角色) ? slotsOf(m.分組ID, m.類型) : 0;
    return {
      活動: eventName || eventId,
      基地: baseOfGroup.get(m.分組ID) ?? '',
      分組類型: m.類型,
      分組名稱: g?.名稱 ?? '',
      代碼: g?.代碼 ?? '',
      姓名: m.姓名 || reg?.姓名 || mem?.姓名 || m.成員ID,
      性別: mem?.性別 ?? '',
      年級: mem?.年級 || reg?.年級 || '',
      學校: mem?.學校 ?? '',
      角色: m.角色,
      報名狀態: reg?.狀態 ?? '',
      一般報到: reg ? checkin(reg.報名ID, '') : '',
      該組報到: reg && m.類型 === '課程' ? checkin(reg.報名ID, m.分組ID) : '',
      出席次數: String(present),
      應出席時段數: expected ? String(expected) : '',
      出席率: pct(present, expected),
      _分組ID: m.分組ID,
      _learner: LEARNER_ROLES.includes(m.角色) && reg?.狀態 !== RegistrationStatus.Cancelled ? '1' : '',
    };
  });
  if (key === 'groupMembers') return rows.sort((a, b) => baseIndex(a.基地) - baseIndex(b.基地)).map(({ _分組ID, _learner, ...r }) => r);

  return [...state.groups].sort((a, b) => baseIndex(baseOfGroup.get(a.分組ID) ?? '') - baseIndex(baseOfGroup.get(b.分組ID) ?? '')).map((g) => {
    const learners = rows.filter((r) => r._分組ID === g.分組ID && r._learner);
    const recorded = aa.filter((a) => a.分組ID === g.分組ID);
    const present = recorded.filter((a) => PRESENT.includes(a.狀態)).length;
    const arrived = learners.filter((r) => (g.類型 === '課程' ? r.該組報到 : r.一般報到) === CheckInStatus.Arrived).length;
    return {
      基地: baseOfGroup.get(g.分組ID) ?? '',
      分組類型: g.類型,
      分組名稱: g.名稱,
      代碼: g.代碼,
      名額: g.名額,
      報名數: String(learners.length),
      報到數: String(arrived),
      點名人次: String(recorded.length),
      出席人次: String(present),
      平均出席率: pct(present, recorded.length),
    };
  });
}

export async function summary(eventId: string) {
  const [allRegs, allCheckIns, allAttendance, state, test] = await Promise.all([
    registrations(eventId).all(),
    checkIns(eventId).all(),
    attendance(eventId).all(),
    loadGroupState(eventId),
    testScope(eventId),
  ]);
  // 測試家庭不納入統計
  const regs = allRegs.filter((r) => !test.regIds.has(r.報名ID));
  const cc = allCheckIns.filter((c) => !test.regIds.has(c.報名ID));
  const aa = allAttendance.filter((a) => !test.memberIds.has(a.成員ID));
  const active = regs.filter((r) => r.狀態 !== RegistrationStatus.Cancelled);
  const countBy = <T,>(list: T[], key: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const x of list) m.set(key(x) || '（空白）', (m.get(key(x) || '（空白）') ?? 0) + 1);
    return [...m.entries()];
  };
  const general = cc.filter((c) => !c.分組ID);
  const accepted = active.filter((r) => r.狀態 === RegistrationStatus.Accepted);
  const arrived = new Set(general.filter((c) => c.狀態 === CheckInStatus.Arrived).map((c) => c.報名ID));
  const activeIds = new Set(active.map((r) => r.報名ID));
  const courseCounts = new Map<string, number>();
  for (const c of state.courses) {
    courseCounts.set(c.名稱, state.members.filter((m) => m.分組ID === c.分組ID && LEARNER_ROLES.includes(m.角色) && activeIds.has(m.報名ID)).length);
  }
  const byGroup = countBy(accepted, (r) => gradeGroup(r.年級)).sort(
    ([a], [b]) => GRADE_GROUP_ORDER.indexOf(a) - GRADE_GROUP_ORDER.indexOf(b),
  );
  // 各基地：正取人數、已報到人數、各課程人數
  const byBase = BASES.map((b) => {
    const list = accepted.filter((r) => baseOf(r.年級) === b.short);
    return {
      ...b,
      accepted: list.length,
      arrived: list.filter((r) => arrived.has(r.報名ID)).length,
      courses: state.courses
        .filter((c) => groupBaseOf(c) === b.short)
        .map((c) => [c.名稱, courseCounts.get(c.名稱) ?? 0] as const),
    };
  });
  return {
    byBase,
    total: regs.length,
    byStatus: countBy(regs, (r) => r.狀態),
    byType: countBy(active, (r) => r.報名類型),
    bySource: countBy(active, (r) => r.來源),
    byGroup: byGroup.map(([g, n]) => [g, n, accepted.filter((r) => gradeGroup(r.年級) === g && arrived.has(r.報名ID)).length] as const),
    byCourse: [...courseCounts.entries()],
    checkin: {
      accepted: accepted.length,
      arrived: accepted.filter((r) => arrived.has(r.報名ID)).length,
      absent: general.filter((c) => c.狀態 === CheckInStatus.Absent).length,
      late: general.filter((c) => c.晚到 === 'Y').length,
    },
    attendance: {
      recorded: aa.length,
      present: aa.filter((a) => PRESENT.includes(a.狀態)).length,
    },
  };
}
