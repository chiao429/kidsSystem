import 'server-only';
import type { Session } from '@kids/auth';
import { BASES, CheckInStatus, MemberType, RegistrationSource, baseOf, isArchivedEvent, newId, nowString, type BaseName } from '@kids/schema';
import { checkIns, ensureSmallGroupTables, events, households, members, registrations, smallGroupAttendance, smallGroupMembers, smallGroups } from './tables';

export type SmallGroup = Awaited<ReturnType<ReturnType<typeof smallGroups>['all']>>[number];

/** 台北時間今天 YYYY-MM-DD */
export const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
export const isDate = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** 預設小組：小組表還沒有資料時建立（夢夢：幼A；思麥特：大衛A、約書亞A） */
const DEFAULT_GROUPS: { 名稱: string; 基地: BaseName }[] = [
  { 名稱: '幼A', 基地: '夢夢' },
  { 名稱: '大衛A', 基地: '思麥特' },
  { 名稱: '約書亞A', 基地: '思麥特' },
];

export async function listGroups(): Promise<SmallGroup[]> {
  await ensureSmallGroupTables();
  let rows = await smallGroups().all({ fresh: true });
  if (rows.length === 0) {
    const now = nowString();
    await smallGroups().append(
      DEFAULT_GROUPS.map((g, i) => ({ 小組ID: newId('小組ID'), ...g, 排序: String(i + 1), 負責人: '', 狀態: '啟用', 說明: '', 建立時間: now })),
    );
    rows = await smallGroups().all({ fresh: true });
  }
  const baseIdx = (b: string) => BASES.findIndex((x) => x.short === b);
  return rows.sort((a, b) => baseIdx(a.基地) - baseIdx(b.基地) || (Number(a.排序) || 0) - (Number(b.排序) || 0));
}

const leadersOf = (g: SmallGroup) => g.負責人.split(',').map((s) => s.trim()).filter(Boolean);
export const isLeader = (g: SmallGroup, session: Session) => leadersOf(g).includes(session.account);

/** 可點名的小組：同工（own）只看自己負責的；其他範圍看全部；停用的不列出 */
export async function visibleGroups(session: Session) {
  const all = (await listGroups()).filter((g) => g.狀態 !== '停用');
  return session.scope === 'own' ? all.filter((g) => isLeader(g, session)) : all;
}

export async function getGroup(session: Session, 小組ID: string) {
  const g = (await visibleGroups(session)).find((x) => x.小組ID === 小組ID);
  if (!g) throw new Error('沒有這個小組的點名權限');
  return g;
}

/** 在某天仍在組的成員（加入日期 ≤ 當天，且沒有離開或離開日期 > 當天） */
export async function rosterOn(小組ID: string, date: string) {
  return (await smallGroupMembers().all({ fresh: true })).filter(
    (m) => m.小組ID === 小組ID && (!m.加入日期 || m.加入日期 <= date) && (!m.離開日期 || m.離開日期 > date),
  );
}

export interface CheckedInKid {
  成員ID: string;
  姓名: string;
  年級: string;
  基地: BaseName;
  活動: string;
  現場報名: boolean;
}

/** 當天在任何活動有「一般報到」的孩子（報到時間以台北日期比對） */
export async function checkedInOn(date: string): Promise<CheckedInKid[]> {
  const [list, mm] = await Promise.all([events().all(), members().all()]);
  const memberById = new Map(mm.map((m) => [m.成員ID, m]));
  const out = new Map<string, CheckedInKid>();
  for (const e of list.filter((x) => !isArchivedEvent(x))) {
    const [cc, regs] = await Promise.all([checkIns(e.活動ID).all().catch(() => []), registrations(e.活動ID).all().catch(() => [])]);
    const regById = new Map(regs.map((r) => [r.報名ID, r]));
    for (const c of cc) {
      if (c.分組ID || c.狀態 !== CheckInStatus.Arrived || !c.報到時間.startsWith(date)) continue;
      const r = regById.get(c.報名ID);
      const m = memberById.get(c.成員ID);
      if (!r || (m && m.類型 === MemberType.Adult)) continue;
      const 年級 = m?.年級 || r.年級;
      out.set(c.成員ID, { 成員ID: c.成員ID, 姓名: m?.姓名 || r.姓名, 年級, 基地: baseOf(年級), 活動: e.名稱, 現場報名: r.來源 === RegistrationSource.OnSite });
    }
  }
  return [...out.values()];
}

/** 孩子資料（姓名、年級、家長、電話、特殊需求），點名名單與挑選組員用 */
export async function kidDirectory() {
  const [mm, hh] = await Promise.all([members().all(), households().all()]);
  const hById = new Map(hh.map((h) => [h.家庭ID, h]));
  return new Map(
    mm
      .filter((m) => m.類型 !== MemberType.Adult)
      .map((m) => {
        const h = hById.get(m.家庭ID);
        return [m.成員ID, { 成員ID: m.成員ID, 姓名: m.姓名, 年級: m.年級, 基地: baseOf(m.年級), 家長: h?.主要聯絡人 ?? '', 電話: h?.電話 ?? '', 特殊需求: m.特殊需求 }] as const;
      }),
  );
}

export async function attendanceOn(小組ID: string, date: string) {
  return (await smallGroupAttendance().all({ fresh: true })).filter((a) => a.小組ID === 小組ID && a.日期 === date);
}
