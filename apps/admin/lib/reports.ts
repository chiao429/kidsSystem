import 'server-only';
import { CheckInStatus, RegistrationStatus, gradeGroup, GRADE_GROUP_ORDER } from '@kids/schema';
import { attendance, checkIns, households, logs, members, registrations, schedules, teams } from './tables';

/** 可匯出的資料集與欄位 */
export const DATASETS = {
  roster: {
    label: '報名名單（含家庭、小隊、報到）',
    columns: ['序號', '姓名', '性別', '年級', '學校', '生日', '家長', '電話', 'Email', '地址', '特殊需求', '課程', '報名狀態', '報名類型', '來源', '報名時間', '小隊', '報到狀態', '報到時間', '晚到', '已聯繫'],
  },
  checkins: { label: '報到紀錄', columns: ['姓名', '課程', '狀態', '報到時間', '方式', '操作者', '晚到', '已聯繫'] },
  attendance: { label: '點名紀錄', columns: ['日期', '時段', '內容', '小隊', '姓名', '狀態', '備註', '操作者', '時間'] },
  logs: { label: '操作日誌', columns: ['時間', '系統', '操作者', '動作', '對象ID', '內容'] },
} as const;

export type DatasetKey = keyof typeof DATASETS;

export async function buildDataset(sheetId: string, key: DatasetKey): Promise<Record<string, string>[]> {
  if (key === 'roster') {
    const [regs, mm, hh, tt, cc] = await Promise.all([
      registrations(sheetId).all(),
      members().all(),
      households().all(),
      teams(sheetId).all(),
      checkIns(sheetId).all(),
    ]);
    const m = new Map(mm.map((x) => [x.成員ID, x]));
    const h = new Map(hh.map((x) => [x.家庭ID, x]));
    const t = new Map(tt.filter((x) => x.角色 === '隊員').map((x) => [x.成員ID, x.小隊]));
    const c = new Map(cc.filter((x) => !x.課程).map((x) => [x.報名ID, x]));
    return regs
      .sort((a, b) => (Number(a.序號) || 1e9) - (Number(b.序號) || 1e9))
      .map((r) => {
        const mem = m.get(r.成員ID);
        const hou = h.get(r.家庭ID);
        const ci = c.get(r.報名ID);
        return {
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
          課程: r.課程,
          報名狀態: r.狀態,
          報名類型: r.報名類型,
          來源: r.來源,
          報名時間: r.報名時間,
          小隊: t.get(r.成員ID) ?? '',
          報到狀態: ci?.狀態 ?? '',
          報到時間: ci?.報到時間 ?? '',
          晚到: ci?.晚到 ?? '',
          已聯繫: ci?.已聯繫 ?? '',
        };
      });
  }
  if (key === 'checkins') return (await checkIns(sheetId).all()) as unknown as Record<string, string>[];
  if (key === 'logs') return (await logs(sheetId).all()) as unknown as Record<string, string>[];
  const [aa, ss] = await Promise.all([attendance(sheetId).all(), schedules(sheetId).all()]);
  const slot = new Map(ss.map((s) => [s.時段ID, s]));
  return aa.map((a) => {
    const s = slot.get(a.時段ID);
    return {
      日期: s?.日期 ?? a.時段ID.replace('DAY-', ''),
      時段: s ? `${s.開始}-${s.結束}` : '整日',
      內容: s?.內容 ?? '',
      小隊: a.小隊,
      姓名: a.姓名,
      狀態: a.狀態,
      備註: a.備註,
      操作者: a.操作者,
      時間: a.時間,
    };
  });
}

export async function summary(sheetId: string) {
  const [regs, cc, aa] = await Promise.all([registrations(sheetId).all(), checkIns(sheetId).all(), attendance(sheetId).all()]);
  const active = regs.filter((r) => r.狀態 !== RegistrationStatus.Cancelled);
  const countBy = <T,>(list: T[], key: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const x of list) m.set(key(x) || '（空白）', (m.get(key(x) || '（空白）') ?? 0) + 1);
    return [...m.entries()];
  };
  const general = cc.filter((c) => !c.課程);
  const accepted = active.filter((r) => r.狀態 === RegistrationStatus.Accepted);
  const arrived = new Set(general.filter((c) => c.狀態 === CheckInStatus.Arrived).map((c) => c.報名ID));
  const courseCounts = new Map<string, number>();
  for (const r of active) for (const c of r.課程.split(',').filter(Boolean)) courseCounts.set(c, (courseCounts.get(c) ?? 0) + 1);
  const byGroup = countBy(accepted, (r) => gradeGroup(r.年級)).sort(
    ([a], [b]) => GRADE_GROUP_ORDER.indexOf(a) - GRADE_GROUP_ORDER.indexOf(b),
  );
  return {
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
      present: aa.filter((a) => a.狀態 === '出席' || a.狀態 === '遲到').length,
    },
  };
}
