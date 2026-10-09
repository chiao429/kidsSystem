import 'server-only';
import { SheetTable } from '@kids/sheets-core';
import {
  HouseholdTable, MemberTable, EventTable, RegistrationTable, SurveyTable, SurveyResponseTable,
} from '@kids/schema';

const MASTER_ID = process.env.GOOGLE_MASTER_SHEET_ID ?? '';

// 寫入：家庭、成員、報名、問卷回覆　讀取：活動、問卷
export const households = () => new SheetTable(MASTER_ID, HouseholdTable);
export const members = () => new SheetTable(MASTER_ID, MemberTable);
export const events = () => new SheetTable(MASTER_ID, EventTable);
export const registrations = (eventSheetId: string) => new SheetTable(eventSheetId, RegistrationTable);
export const surveys = (eventSheetId: string) => new SheetTable(eventSheetId, SurveyTable);
export const surveyResponses = (eventSheetId: string) => new SheetTable(eventSheetId, SurveyResponseTable);
