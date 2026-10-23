import 'server-only';
import { SheetTable } from '@kids/sheets-core';
import {
  HouseholdTable, MemberTable, EventTable, RegistrationTable, CheckInTable, GroupTable, GroupMemberTable, ScheduleTable, LogTable,
} from '@kids/schema';

const C = 'checkin' as const;

export const households = () => new SheetTable('master', HouseholdTable, C, { ttlMs: 30_000 });
export const members = () => new SheetTable('master', MemberTable, C, { ttlMs: 30_000 });
export const events = () => new SheetTable('master', EventTable, C, { ttlMs: 60_000 });
export const registrations = (eventId: string) => new SheetTable(eventId, RegistrationTable, C, { ttlMs: 15_000 });
export const checkIns = (eventId: string) => new SheetTable(eventId, CheckInTable, C, { ttlMs: 5_000 });
export const groups = (eventId: string) => new SheetTable(eventId, GroupTable, C, { ttlMs: 60_000 });
export const groupMembers = (eventId: string) => new SheetTable(eventId, GroupMemberTable, C, { ttlMs: 30_000 });
export const schedules = (eventId: string) => new SheetTable(eventId, ScheduleTable, C, { ttlMs: 60_000 });
export const logs = (eventId: string) => new SheetTable(eventId, LogTable, C);
