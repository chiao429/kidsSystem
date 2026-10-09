import 'server-only';
import { SheetTable } from '@kids/sheets-core';
import {
  HouseholdTable, MemberTable, EventTable, RegistrationTable, CheckInTable, TeamTable, ScheduleTable, LogTable,
} from '@kids/schema';

const MASTER_ID = process.env.GOOGLE_MASTER_SHEET_ID ?? '';

// 寫入：報到、日誌（成員僅可更新特殊需求）　讀取：活動、家庭、報名、小隊、時間表
export const households = () => new SheetTable(MASTER_ID, HouseholdTable, 30_000);
export const members = () => new SheetTable(MASTER_ID, MemberTable, 30_000);
export const events = () => new SheetTable(MASTER_ID, EventTable, 60_000);
export const registrations = (eventSheetId: string) => new SheetTable(eventSheetId, RegistrationTable, 15_000);
export const checkIns = (eventSheetId: string) => new SheetTable(eventSheetId, CheckInTable, 5_000);
export const teams = (eventSheetId: string) => new SheetTable(eventSheetId, TeamTable, 60_000);
export const schedules = (eventSheetId: string) => new SheetTable(eventSheetId, ScheduleTable, 60_000);
export const logs = (eventSheetId: string) => new SheetTable(eventSheetId, LogTable);
