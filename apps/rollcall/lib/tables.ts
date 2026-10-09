import 'server-only';
import { SheetTable } from '@kids/sheets-core';
import {
  EventTable, RegistrationTable, TeamTable, ScheduleTable, CheckInTable, AttendanceTable, LogTable,
} from '@kids/schema';

const MASTER_ID = process.env.GOOGLE_MASTER_SHEET_ID ?? '';

// 寫入：點名、日誌　讀取：活動、報名、小隊、時間表、報到
export const events = () => new SheetTable(MASTER_ID, EventTable, 60_000);
export const registrations = (eventSheetId: string) => new SheetTable(eventSheetId, RegistrationTable, 30_000);
export const teams = (eventSheetId: string) => new SheetTable(eventSheetId, TeamTable, 60_000);
export const schedules = (eventSheetId: string) => new SheetTable(eventSheetId, ScheduleTable, 60_000);
export const checkIns = (eventSheetId: string) => new SheetTable(eventSheetId, CheckInTable, 10_000);
export const attendance = (eventSheetId: string) => new SheetTable(eventSheetId, AttendanceTable, 5_000);
export const logs = (eventSheetId: string) => new SheetTable(eventSheetId, LogTable);
