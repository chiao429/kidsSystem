import 'server-only';
import { SheetTable } from '@kids/sheets-core';
import { HouseholdTable, MemberTable, EventTable, RegistrationTable, GroupTable, GroupMemberTable } from '@kids/schema';

const D = 'data-tools' as const;

export const households = () => new SheetTable('master', HouseholdTable, D);
export const members = () => new SheetTable('master', MemberTable, D);
export const events = () => new SheetTable('master', EventTable, D);
export const registrations = (eventId: string) => new SheetTable(eventId, RegistrationTable, D);
export const groups = (eventId: string) => new SheetTable(eventId, GroupTable, D);
export const groupMembers = (eventId: string) => new SheetTable(eventId, GroupMemberTable, D);
