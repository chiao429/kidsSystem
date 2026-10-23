import 'server-only';
import { SheetTable } from '@kids/sheets-core';
import {
  HouseholdTable, MemberTable, EventTable, RegistrationTable, GroupTable, GroupMemberTable, SurveyTable, SurveyResponseTable,
} from '@kids/schema';

const R = 'registration' as const;

export const households = () => new SheetTable('master', HouseholdTable, R);
export const members = () => new SheetTable('master', MemberTable, R);
export const events = () => new SheetTable('master', EventTable, R);
export const registrations = (eventId: string) => new SheetTable(eventId, RegistrationTable, R);
export const groups = (eventId: string) => new SheetTable(eventId, GroupTable, R);
export const groupMembers = (eventId: string) => new SheetTable(eventId, GroupMemberTable, R);
export const surveys = (eventId: string) => new SheetTable(eventId, SurveyTable, R);
export const surveyResponses = (eventId: string) => new SheetTable(eventId, SurveyResponseTable, R);
