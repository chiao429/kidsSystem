import 'server-only';
import { SheetTable } from '@kids/sheets-core';
import {
  EventTable, RegistrationTable, GroupTable, GroupMemberTable, ScheduleTable, CheckInTable, AttendanceTable, LogTable,
} from '@kids/schema';

const RC = 'rollcall' as const;

export const events = () => new SheetTable('master', EventTable, RC, { ttlMs: 60_000 });
export const registrations = (eventId: string) => new SheetTable(eventId, RegistrationTable, RC, { ttlMs: 30_000 });
export const groups = (eventId: string) => new SheetTable(eventId, GroupTable, RC, { ttlMs: 60_000 });
export const groupMembers = (eventId: string) => new SheetTable(eventId, GroupMemberTable, RC, { ttlMs: 30_000 });
export const schedules = (eventId: string) => new SheetTable(eventId, ScheduleTable, RC, { ttlMs: 60_000 });
export const checkIns = (eventId: string) => new SheetTable(eventId, CheckInTable, RC, { ttlMs: 10_000 });
export const attendance = (eventId: string) => new SheetTable(eventId, AttendanceTable, RC, { ttlMs: 5_000 });
export const logs = (eventId: string) => new SheetTable(eventId, LogTable, RC);
