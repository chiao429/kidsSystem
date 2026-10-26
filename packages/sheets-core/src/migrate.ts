import { createHash } from 'node:crypto';
import { MongoBulkWriteError } from 'mongodb';
import {
  ALL_TABLES, AccountTable, AttendanceTable, CheckInTable, EventTable, GroupMemberTable, GroupTable, HouseholdTable,
  LogTable, MemberTable, RegistrationTable, ScheduleTable, SurveyResponseTable, SurveyTable,
  nowString, parseRules, splitList, type EventRules, type TableDef,
} from '@kids/schema';
import { backendFor, type Backend } from './backend';
import { extractSheetIdFromUrl } from './client';
import { collectionOf, docId, ensureIndexes } from './mongo';
import { normalizeRow } from './store';

/**
 * Google Sheets（或本機 JSON）→ MongoDB 一次性搬遷（只給 admin 使用）。
 * - 一律依 _id upsert，重跑不會重複，也不刪除來源
 * - 舊格式（報名.課程、小隊分頁、報到.課程、點名.小隊、時間表.小隊）轉成統一分組模型
 * - 已是新格式的分頁（例如切換後 Sheet 已被鏡像改寫）直接沿用
 */

type Row = Record<string, string>;

export interface MigrateOptions {
  source: 'sheets' | 'local';
  eventIds?: string[];
  apply: boolean;
}

export interface MigrateIssue {
  scope: string;
  tab: string;
  id: string;
  problem: string;
}

export interface MigrateReport {
  applied: boolean;
  counts: { scope: string; tab: string; rows: number }[];
  issues: MigrateIssue[];
}

const stableId = (prefix: string, ...parts: string[]) =>
  `${prefix}-${createHash('sha1').update(parts.join('\u0001')).digest('hex').slice(0, 10).toUpperCase()}`;

async function readTab(backend: Backend, sheetId: string, tab: string): Promise<{ rows: Row[]; header: string[] } | null> {
  try {
    const values = await backend.values(sheetId, tab);
    const header = (values[0] ?? []).map((h) => String(h).trim());
    const rows = values
      .slice(1)
      .filter((r) => r.some((v) => String(v ?? '').trim()))
      .map((r) => Object.fromEntries(header.map((h, i) => [h, String(r[i] ?? '').trim()])));
    return { rows, header };
  } catch {
    return null;
  }
}

class Collector {
  readonly out = new Map<TableDef, Map<string, Row[]>>();
  readonly issues: MigrateIssue[] = [];

  add(def: TableDef, scope: string, rows: Row[]) {
    const byScope = this.out.get(def) ?? new Map<string, Row[]>();
    this.out.set(def, byScope);
    const list = byScope.get(scope) ?? [];
    const seen = new Set(list.map((r) => r[def.idColumn]));
    for (const r of rows) {
      const id = r[def.idColumn];
      if (!id) {
        this.issue(scope, def.tab, '', `缺少 ${def.idColumn}`);
        continue;
      }
      if (seen.has(id)) {
        this.issue(scope, def.tab, id, '重複 ID（保留第一筆）');
        continue;
      }
      seen.add(id);
      list.push(normalizeRow(def, r) as Row);
    }
    byScope.set(scope, list);
  }

  issue(scope: string, tab: string, id: string, problem: string) {
    this.issues.push({ scope, tab, id, problem });
  }
}

export async function migrate(opts: MigrateOptions): Promise<MigrateReport> {
  const backend = backendFor(opts.source);
  // 搬遷來源：純 Sheets 模式的主資料試算表（環境變數）
  const masterId = process.env.GOOGLE_MASTER_SHEET_ID ?? '';
  const c = new Collector();

  for (const def of [HouseholdTable, MemberTable, AccountTable]) {
    const t = await readTab(backend, masterId, def.tab);
    if (!t) c.issue('master', def.tab, '', '讀不到分頁');
    else c.add(def, 'master', t.rows);
  }
  const eventsTab = await readTab(backend, masterId, EventTable.tab);
  if (!eventsTab) throw new Error('讀不到主資料的「活動」分頁');

  const eventRows: Row[] = [];
  for (const ev of eventsTab.rows) {
    const eventId = ev['活動ID'];
    if (!eventId) continue;
    const rules = parseRules(ev['報名規則']);
    if (opts.eventIds?.length && !opts.eventIds.includes(eventId)) {
      eventRows.push(ev);
      continue;
    }
    const sheetId = extractSheetIdFromUrl(ev['活動試算表'] ?? '');
    if (!sheetId) {
      c.issue(eventId, EventTable.tab, eventId, '沒有活動試算表，略過活動資料');
      eventRows.push(ev);
      continue;
    }
    const newRules = await migrateEvent(backend, sheetId, eventId, rules, c);
    eventRows.push({ ...ev, 報名規則: JSON.stringify(newRules) });
  }
  c.add(EventTable, 'master', eventRows);

  checkRelations(c);

  const counts = [...c.out.entries()].flatMap(([def, byScope]) => [...byScope.entries()].map(([scope, rows]) => ({ scope, tab: def.tab, rows: rows.length })));
  if (opts.apply) await write(c);
  return { applied: opts.apply, counts, issues: c.issues };
}

async function migrateEvent(backend: Backend, sheetId: string, eventId: string, rules: EventRules, c: Collector): Promise<EventRules> {
  const tab = async (name: string) => {
    const t = await readTab(backend, sheetId, name);
    if (!t) c.issue(eventId, name, '', '讀不到分頁（視為空）');
    return t ?? { rows: [], header: [] };
  };
  const courseMode = rules.grouping === 'course';
  const now = nowString();

  // 分組：新格式直接沿用；舊格式由 courses 與小隊分頁產生
  const groups = new Map<string, Row>(); // key: 類型|名稱
  const groupKey = (type: string, name: string) => `${type}|${name}`;
  const ensureGroup = (type: string, name: string, extra: Partial<Row> = {}) => {
    const k = groupKey(type, name);
    if (!groups.has(k)) {
      groups.set(k, { 分組ID: stableId('G', eventId, type, name), 類型: type, 名稱: name, 代碼: '', 名額: '', 區域: '', 說明: '', 排序: String(groups.size + 1), 狀態: '啟用', ...extra });
    }
    return groups.get(k)!;
  };
  const existingGroups = await readTab(backend, sheetId, GroupTable.tab);
  for (const g of existingGroups?.rows ?? []) groups.set(groupKey(g['類型'], g['名稱']), g);
  (rules.courses ?? []).forEach((course) => ensureGroup('課程', course.name, { 名額: course.capacity ? String(course.capacity) : '' }));

  const members: Row[] = [];
  const existingGm = await readTab(backend, sheetId, GroupMemberTable.tab);
  members.push(...(existingGm?.rows ?? []));

  const oldTeams = await readTab(backend, sheetId, '小隊');
  for (const t of oldTeams?.rows ?? []) {
    if (!t['小隊']) continue;
    const g = ensureGroup('小隊', t['小隊'], { 區域: t['區域'] ?? '' });
    if (!g['區域'] && t['區域']) g['區域'] = t['區域'];
    members.push({ 分組成員ID: t['小隊成員ID'], 分組ID: g['分組ID'], 類型: '小隊', 成員ID: t['成員ID'], 姓名: t['姓名'] ?? '', 報名ID: '', 角色: t['角色'] || '隊員', 來源: '搬遷', 建立時間: now });
  }

  const regs = await tab(RegistrationTable.tab);
  for (const r of regs.rows) {
    for (const name of splitList(r['課程'])) {
      const k = groupKey('課程', name);
      if (!groups.has(k)) {
        c.issue(eventId, RegistrationTable.tab, r['報名ID'], `課程「${name}」不在課程設定中，已自動建立`);
      }
      const g = ensureGroup('課程', name);
      members.push({ 分組成員ID: stableId('T', eventId, g['分組ID'], r['成員ID']), 分組ID: g['分組ID'], 類型: '課程', 成員ID: r['成員ID'], 姓名: r['姓名'], 報名ID: r['報名ID'], 角色: '學員', 來源: '搬遷', 建立時間: r['報名時間'] || now });
    }
  }
  // 小隊隊員補上報名ID
  const regByMember = new Map(regs.rows.map((r) => [r['成員ID'], r['報名ID']]));
  for (const m of members) if (m['類型'] === '小隊' && !m['報名ID'] && m['角色'] === '隊員') m['報名ID'] = regByMember.get(m['成員ID']) ?? '';

  const idByName = (type: string, name: string, tabName: string, id: string): string => {
    if (!name) return '';
    const g = groups.get(groupKey(type, name));
    if (!g) c.issue(eventId, tabName, id, `找不到${type}「${name}」`);
    return g?.['分組ID'] ?? '';
  };

  const checkins = await tab(CheckInTable.tab);
  const checkinRows = checkins.header.includes('分組ID')
    ? checkins.rows
    : checkins.rows.map((r) => ({ ...r, 分組ID: idByName('課程', r['課程'] ?? '', CheckInTable.tab, r['報到ID']) }));

  const att = await tab(AttendanceTable.tab);
  const attRows = att.header.includes('分組ID')
    ? att.rows
    : att.rows.map((r) => ({ ...r, 分組ID: idByName(courseMode ? '課程' : '小隊', r['小隊'] ?? '', AttendanceTable.tab, r['點名ID']) }));

  const sch = await tab(ScheduleTable.tab);
  const schRows = sch.header.includes('分組ID')
    ? sch.rows
    : sch.rows.map((r) => {
        const all = !r['小隊'] || r['小隊'] === '全部';
        return {
          ...r,
          分組ID: all ? '' : idByName(courseMode ? '課程' : '小隊', r['小隊'], ScheduleTable.tab, r['時段ID']),
          分組類型: all ? (courseMode ? '課程' : '小隊') : '',
        };
      });

  c.add(GroupTable, eventId, [...groups.values()]);
  c.add(GroupMemberTable, eventId, members);
  c.add(RegistrationTable, eventId, regs.rows);
  c.add(CheckInTable, eventId, checkinRows);
  c.add(AttendanceTable, eventId, attRows);
  c.add(ScheduleTable, eventId, schRows);
  for (const def of [SurveyTable, SurveyResponseTable, LogTable]) c.add(def, eventId, (await tab(def.tab)).rows);

  const hasCourses = [...groups.values()].some((g) => g['類型'] === '課程');
  const hasTeams = [...groups.values()].some((g) => g['類型'] === '小隊');
  const { courses: _courses, grouping: _grouping, ...rest } = rules;
  return { ...rest, groupTypes: courseMode ? ['課程'] : hasCourses && hasTeams ? ['小隊', '課程'] : hasCourses ? ['課程'] : ['小隊'] };
}

function checkRelations(c: Collector) {
  const ids = (def: TableDef, scope: string) => new Set((c.out.get(def)?.get(scope) ?? []).map((r) => r[def.idColumn]));
  const memberIds = ids(MemberTable, 'master');
  const accountIds = ids(AccountTable, 'master');
  const householdIds = ids(HouseholdTable, 'master');
  for (const scope of c.out.get(RegistrationTable)?.keys() ?? []) {
    const regIds = ids(RegistrationTable, scope);
    for (const r of c.out.get(RegistrationTable)?.get(scope) ?? []) {
      if (!memberIds.has(r['成員ID'])) c.issue(scope, RegistrationTable.tab, r['報名ID'], `成員ID ${r['成員ID']} 不存在`);
      if (r['家庭ID'] && !householdIds.has(r['家庭ID'])) c.issue(scope, RegistrationTable.tab, r['報名ID'], `家庭ID ${r['家庭ID']} 不存在`);
    }
    for (const r of c.out.get(CheckInTable)?.get(scope) ?? []) {
      if (!regIds.has(r['報名ID'])) c.issue(scope, CheckInTable.tab, r['報到ID'], `報名ID ${r['報名ID']} 不存在`);
    }
    for (const m of c.out.get(GroupMemberTable)?.get(scope) ?? []) {
      if (m['成員ID'] && !memberIds.has(m['成員ID']) && !accountIds.has(m['成員ID'])) c.issue(scope, GroupMemberTable.tab, m['分組成員ID'], `成員ID/帳號 ${m['成員ID']} 不存在`);
    }
  }
}

/**
 * 只覆寫「由搬遷建立、之後沒被系統修改過」（_migrated 且 _ver = 1）的資料；
 * 切換後系統已修改的資料不會被重跑的搬遷蓋掉，會列在報告中。
 */
async function write(c: Collector) {
  for (const def of ALL_TABLES) await ensureIndexes(def);
  for (const [def, byScope] of c.out) {
    const col = await collectionOf(def);
    for (const [scope, rows] of byScope) {
      if (rows.length === 0) continue;
      const base = Date.now() * 1000;
      try {
        await col.bulkWrite(
          rows.map((r, i) => ({
            replaceOne: {
              filter: { _id: docId(scope, r[def.idColumn]), _migrated: true, _ver: 1 },
              replacement: { ...r, _id: docId(scope, r[def.idColumn]), _scope: scope, _ver: 1, _ord: base + i, _dirty: true, _deleted: false, _migrated: true, _updatedAt: new Date() },
              upsert: true,
            },
          })),
          { ordered: false },
        );
      } catch (e) {
        if (!(e instanceof MongoBulkWriteError)) throw e;
        const errors = Array.isArray(e.writeErrors) ? e.writeErrors : [e.writeErrors];
        for (const we of errors) {
          if (we.code !== 11000) throw e;
          const row = rows[we.index];
          c.issue(scope, def.tab, row?.[def.idColumn] ?? '', '系統中已有修改過的資料，未覆寫');
        }
      }
    }
  }
}
