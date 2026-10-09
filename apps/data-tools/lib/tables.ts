import 'server-only';
import { SheetTable } from '@kids/sheets-core';
import { HouseholdTable, MemberTable, EventTable, RegistrationTable, TeamTable } from '@kids/schema';

const MASTER_ID = process.env.GOOGLE_MASTER_SHEET_ID ?? '';

// 寫入：小隊　讀取：家庭、成員、活動、報名
export const households = () => new SheetTable(MASTER_ID, HouseholdTable);
export const members = () => new SheetTable(MASTER_ID, MemberTable);
export const events = () => new SheetTable(MASTER_ID, EventTable);
export const registrations = (eventSheetId: string) => new SheetTable(eventSheetId, RegistrationTable);
export const teams = (eventSheetId: string) => new SheetTable(eventSheetId, TeamTable);
