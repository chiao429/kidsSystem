import 'server-only';
import { SheetTable } from '@kids/sheets-core';
import {
  AccountTable, CheckInTable, EventTable, HouseholdTable, MemberTable, RegistrationTable,
  SmallGroupAttendanceTable, SmallGroupMeetingTable, SmallGroupMemberTable, SmallGroupTable,
} from '@kids/schema';

// 寫入：小組、小組成員、小組點名　讀取：家庭、成員、帳號、活動、各活動的報名與報到（帶入當天報到的孩子）
const SG = 'smallgroups' as const;

export const smallGroups = () => new SheetTable('master', SmallGroupTable, SG, { ttlMs: 30_000 });
export const smallGroupMembers = () => new SheetTable('master', SmallGroupMemberTable, SG, { ttlMs: 10_000 });
export const smallGroupAttendance = () => new SheetTable('master', SmallGroupAttendanceTable, SG, { ttlMs: 3_000 });
export const smallGroupMeetings = () => new SheetTable('master', SmallGroupMeetingTable, SG, { ttlMs: 5_000 });
export const households = () => new SheetTable('master', HouseholdTable, SG, { ttlMs: 30_000 });
export const members = () => new SheetTable('master', MemberTable, SG, { ttlMs: 30_000 });
export const accounts = () => new SheetTable('master', AccountTable, SG, { ttlMs: 60_000 });
export const events = () => new SheetTable('master', EventTable, SG, { ttlMs: 60_000 });
export const registrations = (eventId: string) => new SheetTable(eventId, RegistrationTable, SG, { ttlMs: 15_000 });
export const checkIns = (eventId: string) => new SheetTable(eventId, CheckInTable, SG, { ttlMs: 5_000 });

let ensured: Promise<void> | null = null;
/** 第一次寫入前建立小組三張表（Mongo 唯一索引、Sheet 分頁），同一程序只做一次 */
export function ensureSmallGroupTables() {
  ensured ??= (async () => {
    await smallGroups().ensure();
    await smallGroupMembers().ensure();
    await smallGroupAttendance().ensure();
    await smallGroupMeetings().ensure();
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}
