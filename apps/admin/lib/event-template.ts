import 'server-only';
import { newId, type EventRules } from '@kids/schema';
import { getEvent } from './events';
import { groups, schedules, signatures, surveys } from './tables';

/** 複製活動／活動範本沿用的活動欄位（報名頁內容）；名稱、日期、報名時間與規則以表單為準 */
export const COPIED_EVENT_COLUMNS = ['活動時間', '地點', '報到時間', '繳費時間', '活動說明', '適用對象', '報名提醒', '備註', '簽名檔', '分組說明'] as const;

type Rows = Record<string, string>[];

/** 活動範本檔（JSON）：活動設定＋報名頁內容＋課程、小隊、時間表、問卷；不含報名、報到、點名等資料 */
export interface EventTemplate {
  format: 'kids-event-template';
  version: 1;
  exportedAt: string;
  event: Record<string, string>;
  rules: EventRules;
  groups: Rows;
  schedules: Rows;
  surveys: Rows;
}

export interface EventContent {
  groups: Rows;
  schedules: Rows;
  surveys: Rows;
}

export async function loadEventContent(eventId: string): Promise<EventContent> {
  const [gg, ss, sv] = await Promise.all([groups(eventId).all(), schedules(eventId).all(), surveys(eventId).all()]);
  return { groups: gg as unknown as Rows, schedules: ss as unknown as Rows, surveys: sv as unknown as Rows };
}

export async function buildTemplate(eventId: string): Promise<EventTemplate> {
  const e = await getEvent(eventId);
  const { statusBeforeArchive: _s, ...rules } = e.rules;
  const event: Record<string, string> = {
    名稱: e.名稱,
    版本: e.版本,
    開始日期: e.開始日期,
    結束日期: e.結束日期,
    報名開放: e.報名開放,
    報名截止: e.報名截止,
    ...Object.fromEntries(COPIED_EVENT_COLUMNS.map((c) => [c, e[c] ?? ''])),
  };
  return { format: 'kids-event-template', version: 1, exportedAt: new Date().toISOString(), event, rules, ...(await loadEventContent(eventId)) };
}

/** 讀取上傳的範本檔；格式不符回傳錯誤訊息 */
export function parseTemplate(text: string): EventTemplate | string {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return '範本檔不是有效的 JSON';
  }
  const t = data as Partial<EventTemplate>;
  if (t?.format !== 'kids-event-template' || t.version !== 1 || typeof t.event !== 'object') return '這不是活動範本檔（請用活動清單的「匯出範本」產生）';
  const rows = (v: unknown): Rows => (Array.isArray(v) ? v.filter((r) => r && typeof r === 'object').map((r) => Object.fromEntries(Object.entries(r).map(([k, x]) => [k, String(x ?? '')]))) : []);
  return {
    format: 'kids-event-template',
    version: 1,
    exportedAt: String(t.exportedAt ?? ''),
    event: Object.fromEntries(Object.entries(t.event ?? {}).map(([k, v]) => [k, String(v ?? '')])),
    rules: t.rules && typeof t.rules === 'object' ? t.rules : {},
    groups: rows(t.groups),
    schedules: rows(t.schedules),
    surveys: rows(t.surveys),
  };
}

/** 範本的簽名檔在這個環境不存在時改用預設簽名檔 */
export async function resolveSignature(value: string): Promise<string> {
  if (!value || value === '無') return value;
  return (await signatures().findById(value)) ? value : '';
}

/** 把課程、小隊、時間表與問卷寫進新活動（換新 ID；時間表的分組ID 對應到新的分組） */
export async function writeEventContent(toId: string, content: EventContent) {
  const groupIdMap = new Map(content.groups.map((g) => [g.分組ID, newId('分組ID')]));
  if (content.groups.length) await groups(toId).append(content.groups.map((g) => ({ ...g, 分組ID: groupIdMap.get(g.分組ID)! })));
  // 分組已不存在的時段改為不限分組，避免指向舊活動的分組
  if (content.schedules.length)
    await schedules(toId).append(content.schedules.map((s) => ({ ...s, 時段ID: newId('時段ID'), 分組ID: s.分組ID ? groupIdMap.get(s.分組ID) ?? '' : '' })));
  if (content.surveys.length) await surveys(toId).append(content.surveys.map((s) => ({ ...s, 問卷ID: newId('問卷ID') })));
}
