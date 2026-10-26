import 'server-only';
import { SheetTable } from '@kids/sheets-core';
import {
  HouseholdTable, MemberTable, EventTable, SignatureTable, RegistrationTable, GroupTable, GroupMemberTable, SurveyTable, SurveyResponseTable,
  CheckInTable,
} from '@kids/schema';

const R = 'registration' as const;

export const households = () => new SheetTable('master', HouseholdTable, R);
export const members = () => new SheetTable('master', MemberTable, R);
export const events = () => new SheetTable('master', EventTable, R);
/** 唯讀：家長頁活動說明下方的簽名檔 */
export const signatures = () => new SheetTable('master', SignatureTable, R);
export const registrations = (eventId: string) => new SheetTable(eventId, RegistrationTable, R);
export const groups = (eventId: string) => new SheetTable(eventId, GroupTable, R);
export const groupMembers = (eventId: string) => new SheetTable(eventId, GroupMemberTable, R);
/** 報到紀錄（只讀）：家長查詢 QR code 時判斷是否已報到 */
export const checkIns = (eventId: string) => new SheetTable(eventId, CheckInTable, R);
export const surveys = (eventId: string) => new SheetTable(eventId, SurveyTable, R);
export const surveyResponses = (eventId: string) => new SheetTable(eventId, SurveyResponseTable, R);
