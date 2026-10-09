import 'server-only';
import { SheetTable } from '@easyevent/sheets-core';
import {
  MASTER_TABLES, EVENT_TABLES,
  HouseholdTable, MemberTable, AccountTable, EventTable,
  RegistrationTable, CheckInTable, TeamTable, ScheduleTable,
  AttendanceTable, SurveyTable, SurveyResponseTable, LogTable,
} from '@easyevent/schema';

const MASTER_ID = process.env.GOOGLE_MASTER_SHEET_ID ?? '';

// 寫入：帳號、活動、時間表、問卷、日誌（其餘僅更新 updatableBy.admin 欄位）　讀取：全部（報表）
export const households = () => new SheetTable(MASTER_ID, HouseholdTable);
export const members = () => new SheetTable(MASTER_ID, MemberTable);
export const accounts = () => new SheetTable(MASTER_ID, AccountTable);
export const events = () => new SheetTable(MASTER_ID, EventTable);
export const registrations = (id: string) => new SheetTable(id, RegistrationTable);
export const checkIns = (id: string) => new SheetTable(id, CheckInTable);
export const teams = (id: string) => new SheetTable(id, TeamTable);
export const schedules = (id: string) => new SheetTable(id, ScheduleTable);
export const attendance = (id: string) => new SheetTable(id, AttendanceTable);
export const surveys = (id: string) => new SheetTable(id, SurveyTable);
export const surveyResponses = (id: string) => new SheetTable(id, SurveyResponseTable);
export const logs = (id: string) => new SheetTable(id, LogTable);

/** 初始化：建立主資料試算表與活動試算表的所有分頁與標題列 */
export async function ensureMasterTables() {
  for (const def of MASTER_TABLES) await new SheetTable(MASTER_ID, def).ensure();
}
export async function ensureEventTables(eventSheetId: string) {
  for (const def of EVENT_TABLES) await new SheetTable(eventSheetId, def).ensure();
}
