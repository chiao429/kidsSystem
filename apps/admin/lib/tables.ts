import 'server-only';
import { SheetTable, dataBackend, ensureSheetTabs } from '@kids/sheets-core';
import {
  MASTER_TABLES, EVENT_TABLES,
  HouseholdTable, MemberTable, AccountTable, EventTable,
  RegistrationTable, CheckInTable, GroupTable, GroupMemberTable, ScheduleTable,
  AttendanceTable, SurveyTable, SurveyResponseTable, LogTable,
} from '@kids/schema';

// 寫入：帳號、活動、時間表、問卷、日誌、課程分組（及課程/小隊分組成員）
// 其餘僅更新 updatableBy.admin 欄位　讀取：全部（報表）
const A = 'admin' as const;

export const households = () => new SheetTable('master', HouseholdTable, A);
export const members = () => new SheetTable('master', MemberTable, A);
export const accounts = () => new SheetTable('master', AccountTable, A);
export const events = () => new SheetTable('master', EventTable, A);
export const registrations = (eventId: string) => new SheetTable(eventId, RegistrationTable, A);
export const checkIns = (eventId: string) => new SheetTable(eventId, CheckInTable, A);
export const groups = (eventId: string) => new SheetTable(eventId, GroupTable, A);
export const groupMembers = (eventId: string) => new SheetTable(eventId, GroupMemberTable, A);
export const schedules = (eventId: string) => new SheetTable(eventId, ScheduleTable, A);
export const attendance = (eventId: string) => new SheetTable(eventId, AttendanceTable, A);
export const surveys = (eventId: string) => new SheetTable(eventId, SurveyTable, A);
export const surveyResponses = (eventId: string) => new SheetTable(eventId, SurveyResponseTable, A);
export const logs = (eventId: string) => new SheetTable(eventId, LogTable, A);

/** mongo：建立索引，並在主資料試算表建立分頁（鏡像目的地）；sheets：建立分頁 */
export async function ensureMasterTables() {
  for (const def of MASTER_TABLES) await new SheetTable('master', def, A).ensure();
  if (dataBackend() === 'mongo') await ensureSheetTabs(process.env.GOOGLE_MASTER_SHEET_ID ?? '', MASTER_TABLES);
}

/** 先直接在活動試算表建立分頁（同時確認 service account 權限），mongo 模式再建立索引 */
export async function ensureEventTables(eventId: string, spreadsheetId: string) {
  await ensureSheetTabs(spreadsheetId, EVENT_TABLES);
  if (dataBackend() === 'mongo') for (const def of EVENT_TABLES) await new SheetTable(eventId, def, A).ensure();
}
