import 'server-only';
import * as XLSX from 'xlsx';
import {
  MemberType,
  RegistrationSource,
  RegistrationStatus,
  RegistrationType,
  newId,
  normalizeGrade,
  normalizePhone,
  nowString,
  type HouseholdTable,
  type MemberTable,
  type RegistrationTable,
  type RowOf,
} from '@kids/schema';
import { readRawTab } from '@kids/sheets-core';
import { isActive, nextSerial } from './eligibility';
import type { EventInfo } from './events';
import { households, members, registrations } from './tables';

type Raw = Record<string, string>;

/** 去掉標題中的換行、空白與「(收費同工)」這類前綴 */
const cleanHeader = (h: unknown) =>
  String(h ?? '')
    .replace(/\s+/g, '')
    .replace(/^[(（][^)）]*[)）]/, '');

const cleanKeys = (rows: Raw[]): Raw[] =>
  rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [cleanHeader(k), v])));

const pick = (row: Raw, keys: string[]) => {
  for (const k of keys) {
    const v = String(row[k] ?? '').trim();
    if (v) return v;
  }
  return '';
};

/** 對應 eventDataClean / 舊報名表的欄位名稱 */
function normalizeRow(row: Raw) {
  const serial = pick(row, ['報名序號', '序號']).replace(/[^\d]/g, '');
  return {
    serial,
    name: pick(row, ['兒童姓名', '姓名', '孩童姓名', '學員姓名']),
    gender: pick(row, ['性別']).replace('生', ''),
    grade: pick(row, ['年級']),
    school: pick(row, ['學校']),
    birthday: pick(row, ['生日', '出生日期']),
    parent: pick(row, ['家長姓名', '主要聯絡人', '聯絡人']),
    phone: normalizePhone(pick(row, ['家長行動電話', '家長電話', '聯絡電話', '電話', '手機'])),
    email: pick(row, ['Email', 'email', '電子郵件']),
    special: pick(row, ['特殊需求', '過敏', '健康狀況', '備註']),
    cancelled: /取消/.test(pick(row, ['狀態', '備註', '報名序號'])),
  };
}

export async function readUpload(file: File): Promise<Raw[]> {
  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // 自動找標題列：前 10 列中第一個含「姓名」的列
  const grid = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false });
  const headerIdx = Math.max(0, grid.slice(0, 10).findIndex((r) => r.some((c) => String(c).includes('姓名'))));
  const header = (grid[headerIdx] ?? []).map(cleanHeader);
  return grid
    .slice(headerIdx + 1)
    .filter((r) => r.some((c) => String(c).trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, String(r[i] ?? '').trim()])));
}

export async function readSheet(spreadsheetId: string, tab: string): Promise<Raw[]> {
  return cleanKeys(await readRawTab(spreadsheetId, tab));
}

export interface ImportSummary {
  total: number;
  skipped: string[];
  newHouseholds: number;
  newMembers: number;
  newRegistrations: number;
  alreadyRegistered: number;
}

export async function importRows(event: EventInfo, raw: Raw[], dryRun: boolean): Promise<ImportSummary> {
  const now = nowString();
  const [hh, mm, regs] = await Promise.all([
    households().all({ fresh: true }),
    members().all({ fresh: true }),
    registrations(event.活動ID).all({ fresh: true }),
  ]);
  const newHH: RowOf<typeof HouseholdTable>[] = [];
  const newMM: RowOf<typeof MemberTable>[] = [];
  const newRegs: RowOf<typeof RegistrationTable>[] = [];
  const summary: ImportSummary = { total: raw.length, skipped: [], newHouseholds: 0, newMembers: 0, newRegistrations: 0, alreadyRegistered: 0 };

  const allHH = [...hh];
  const allMM = [...mm];
  const usedSerials = new Set(regs.map((r) => r.序號));
  let serial = nextSerial(regs);

  raw.forEach((r, i) => {
    const row = normalizeRow(r);
    if (!row.name) return void summary.skipped.push(`第 ${i + 2} 列：沒有姓名`);
    if (row.cancelled) return void summary.skipped.push(`第 ${i + 2} 列：${row.name} 已取消`);
    if (!row.phone && !row.parent) return void summary.skipped.push(`第 ${i + 2} 列：${row.name} 沒有家長電話或姓名`);

    // 家庭：電話優先，其次家長姓名
    let household = allHH.find((h) => (row.phone ? normalizePhone(h.電話) === row.phone : h.主要聯絡人 === row.parent));
    if (!household) {
      household = { 家庭ID: newId('家庭ID'), 主要聯絡人: row.parent, 電話: row.phone, Email: row.email, 地址: '', 建立時間: now, 更新時間: now };
      allHH.push(household);
      newHH.push(household);
    }

    let member = allMM.find((m) => m.家庭ID === household!.家庭ID && m.姓名 === row.name);
    if (!member) {
      member = {
        成員ID: newId('成員ID'),
        家庭ID: household.家庭ID,
        姓名: row.name,
        性別: row.gender,
        生日: row.birthday,
        年級: row.grade ? normalizeGrade(row.grade) : '',
        學校: row.school,
        類型: MemberType.Child,
        特殊需求: row.special,
        建立時間: now,
        更新時間: now,
      };
      allMM.push(member);
      newMM.push(member);
    }

    if ([...regs, ...newRegs].some((x) => x.成員ID === member!.成員ID && isActive(x))) {
      summary.alreadyRegistered++;
      return;
    }
    let s = row.serial && !usedSerials.has(row.serial) ? row.serial : '';
    if (!s) {
      while (usedSerials.has(String(serial))) serial++;
      s = String(serial++);
    }
    usedSerials.add(s);
    newRegs.push({
      報名ID: newId('報名ID'),
      序號: s,
      成員ID: member.成員ID,
      家庭ID: household.家庭ID,
      姓名: member.姓名,
      年級: member.年級,
      報名類型: newHH.includes(household) ? RegistrationType.FirstTime : RegistrationType.General,
      狀態: RegistrationStatus.Accepted,
      來源: RegistrationSource.Import,
      報名時間: now,
      備註: row.serial ? `原報名序號 ${row.serial}` : '',
    });
  });

  summary.newHouseholds = newHH.length;
  summary.newMembers = newMM.length;
  summary.newRegistrations = newRegs.length;
  if (!dryRun) {
    await households().append(newHH);
    await members().append(newMM);
    await registrations(event.活動ID).append(newRegs);
  }
  return summary;
}
