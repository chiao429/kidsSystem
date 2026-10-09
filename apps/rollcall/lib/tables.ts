import 'server-only';
import { SheetTable } from '@easyevent/sheets-core';
import { EventTable, AccountTable, TeamTable, ScheduleTable, CheckInTable, AttendanceTable } from '@easyevent/schema';

const MASTER_ID = process.env.GOOGLE_MASTER_SHEET_ID ?? '';

// 寫入：點名　讀取：活動、帳號、小隊、時間表、報到
export const events = () => new SheetTable(MASTER_ID, EventTable);
export const accounts = () => new SheetTable(MASTER_ID, AccountTable, 60_000);
export const teams = (eventSheetId: string) => new SheetTable(eventSheetId, TeamTable, 60_000);
export const schedules = (eventSheetId: string) => new SheetTable(eventSheetId, ScheduleTable, 60_000);
export const checkIns = (eventSheetId: string) => new SheetTable(eventSheetId, CheckInTable);
export const attendance = (eventSheetId: string) => new SheetTable(eventSheetId, AttendanceTable, 5_000);
