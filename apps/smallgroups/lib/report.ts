import 'server-only';
import { AttendanceStatus } from '@kids/schema';
import { checkedInOn, listGroups } from './data';
import { smallGroupAttendance, smallGroupMeetings, smallGroupMembers } from './tables';

export const REPORT_HEADER = '格式👉小組：《週日》總人數/新朋友/同工；《線上聚會》總人數/新朋友/同工；《個別線上分享》總人數';

const PRESENT: string[] = [AttendanceStatus.Present, AttendanceStatus.Late];

export interface GroupLine {
  名稱: string;
  週日: [number, number, number];
  線上: [number, number, number];
  個別: number;
}

/**
 * 某一天的小組人數統計（LINE 推播格式）：
 * - 週日總人數＝點名出席＋遲到；新朋友＝在這個小組第一次出席；同工＝小組負責人人數
 * - 線上聚會、個別線上分享＝組長在點名頁填的數字
 * - 其他未統計到＝當天有報到、但不在任何小組的孩子（計入合計的總人數與新朋友）
 */
export async function buildReport(date: string) {
  const [groups, attendance, meetings, memberships, arrived] = await Promise.all([
    listGroups(),
    smallGroupAttendance().all({ fresh: true }),
    smallGroupMeetings().all({ fresh: true }),
    smallGroupMembers().all({ fresh: true }),
    checkedInOn(date),
  ]);
  // 夢夢在前、思麥特在後，再依排序與名稱
  const baseOrder = (b: string) => (b === '夢夢' ? 0 : 1);
  const active = groups
    .filter((g) => g.狀態 !== '停用')
    .sort((a, b) => baseOrder(a.基地) - baseOrder(b.基地) || (Number(a.排序) || 0) - (Number(b.排序) || 0) || a.名稱.localeCompare(b.名稱, 'zh-Hant'));
  const firstPresent = new Map<string, string>();
  for (const a of attendance) {
    if (!PRESENT.includes(a.狀態)) continue;
    const key = `${a.小組ID}|${a.成員ID}`;
    const prev = firstPresent.get(key);
    if (!prev || a.日期 < prev) firstPresent.set(key, a.日期);
  }
  const lines: GroupLine[] = active.map((g) => {
    const present = attendance.filter((a) => a.小組ID === g.小組ID && a.日期 === date && PRESENT.includes(a.狀態));
    const newcomers = present.filter((a) => firstPresent.get(`${g.小組ID}|${a.成員ID}`) === date).length;
    const staff = g.負責人.split(',').filter(Boolean).length;
    const m = meetings.find((x) => x.小組ID === g.小組ID && x.日期 === date);
    const n = (v?: string) => Math.max(0, Number(v) || 0);
    return { 名稱: g.名稱, 週日: [present.length, newcomers, staff], 線上: [n(m?.線上總人數), n(m?.線上新朋友), n(m?.線上同工)], 個別: n(m?.個別線上分享) };
  });
  // 當天在任何小組的孩子（加入日期 ≤ 當天，且還沒離開）
  const inGroup = new Set(memberships.filter((m) => (!m.加入日期 || m.加入日期 <= date) && (!m.離開日期 || m.離開日期 > date)).map((m) => m.成員ID));
  const others = arrived.filter((k) => !inGroup.has(k.成員ID));
  const sum = (pick: (l: GroupLine) => number) => lines.reduce((s, l) => s + pick(l), 0);
  const total: GroupLine = {
    名稱: '合計',
    週日: [sum((l) => l.週日[0]) + others.length, sum((l) => l.週日[1]) + others.length, sum((l) => l.週日[2])],
    線上: [sum((l) => l.線上[0]), sum((l) => l.線上[1]), sum((l) => l.線上[2])],
    個別: sum((l) => l.個別),
  };
  const fmt = (l: GroupLine) => `${l.名稱}：${l.週日.join('/')}；${l.線上.join('/')}；${l.個別}`;
  const text = [
    REPORT_HEADER,
    '',
    ...lines.map(fmt),
    `其他未統計到資訊：${others.length ? others.map((k) => `${k.姓名}(${k.年級 || '未填年級'})`).join('、') : '無'}`,
    fmt(total),
  ].join('\n');
  return { date, lines, others, total, text };
}
