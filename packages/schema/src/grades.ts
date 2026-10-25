/** 所有年級的合法值與排序（含國中，舊資料正規化與排序用） */
export const ALL_GRADES = [
  '未就學', '小班', '中班', '大班',
  '一年級', '二年級', '三年級', '四年級', '五年級', '六年級',
  '國一', '國二', '國三',
] as const;

export type Grade = (typeof ALL_GRADES)[number];

/** 可選擇的年級（報名表單、課程、活動設定的選單）：只到國小，不開放國中 */
export const GRADE_OPTIONS = ALL_GRADES.slice(0, ALL_GRADES.indexOf('國一')) as readonly Grade[];

/** 選單用：目前的值不在選項裡（例如舊資料的國中年級）時也列出，避免儲存時被清掉 */
export const gradeChoices = (current?: string): readonly string[] =>
  current && !(GRADE_OPTIONS as readonly string[]).includes(current) ? [...GRADE_OPTIONS, current] : GRADE_OPTIONS;

/** 基地：國小（一~六年級）是思麥特基地，學齡前（未就學~大班）是夢夢基地；報到等資料依基地分開顯示 */
export const BASES = [
  { short: '思麥特', name: '思麥特基地', note: '國小' },
  { short: '夢夢', name: '夢夢基地', note: '學齡前' },
] as const;
export type BaseName = (typeof BASES)[number]['short'];
export const baseOf = (grade: string | undefined | null): BaseName => (gradeRank(grade) >= 1 ? '思麥特' : '夢夢');

/**
 * 分組（課程／小隊）屬於哪個基地：課程看年級限制；沒有年級限制（例如小隊）看成員年級的多數；都沒有時歸思麥特
 */
export function groupBaseOf(group: { 最低年級?: string; 最高年級?: string }, memberGrades: string[] = []): BaseName {
  const limit = group.最高年級 || group.最低年級;
  if (limit) return baseOf(limit);
  const dream = memberGrades.filter((g) => baseOf(g) === '夢夢').length;
  return memberGrades.length > 0 && dream > memberGrades.length / 2 ? '夢夢' : '思麥特';
}

/** 學齡前（未就學~大班）分組時合併 */
export const PRESCHOOL_GROUP = '學齡前';

/** 把各種寫法（"2"、"二"、"小二"、"國中一年級"）轉成數字：未就學/小班=-3、中班=-2、大班=-1、一年級=1…國三=9 */
export function gradeRank(input: string | undefined | null): number {
  const s = String(input ?? '').trim();
  if (!s || s.includes('未就學') || s.includes('小班')) return -3;
  if (s.includes('中班')) return -2;
  if (s.includes('大班')) return -1;
  if (s.includes('國') || /^[七八九789]/.test(s)) {
    if (/[一1七7]/.test(s)) return 7;
    if (/[二2八8]/.test(s)) return 8;
    if (/[三3九9]/.test(s)) return 9;
  }
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  for (const [k, v] of Object.entries(map)) if (s.includes(k)) return v;
  const digit = s.match(/[1-6]/);
  if (digit) return Number(digit[0]);
  return -3;
}

/** 標準化成 ALL_GRADES 之一 */
export function normalizeGrade(input: string | undefined | null): Grade {
  const s = String(input ?? '').trim();
  if (s.includes('小班')) return '小班';
  const rank = gradeRank(s);
  if (rank === -3) return '未就學';
  if (rank === -2) return '中班';
  if (rank === -1) return '大班';
  return ALL_GRADES[rank + 3];
}

/** 分組用名稱：學齡前合併 */
export function gradeGroup(input: string | undefined | null): string {
  const rank = gradeRank(input);
  return rank < 1 ? PRESCHOOL_GROUP : normalizeGrade(input);
}

export const GRADE_GROUP_ORDER = [PRESCHOOL_GROUP, ...GRADE_OPTIONS.slice(4)];

/** 手足稱謂（相對於 current） */
export function siblingTitle(currentGrade: string, siblingGrade: string, siblingGender: string): string {
  const a = gradeRank(currentGrade);
  const b = gradeRank(siblingGrade);
  if (a === b) return '同年齡';
  const male = siblingGender === '男';
  return b > a ? (male ? '哥哥' : '姊姊') : male ? '弟弟' : '妹妹';
}

/** 台灣手機號碼標準化：912345678 → 0912345678，去除空白與 - */
export function normalizePhone(input: string | undefined | null): string {
  let s = String(input ?? '').replace(/[\s\-()]/g, '');
  if (/^9\d{8}$/.test(s)) s = '0' + s;
  if (s.startsWith('+886')) s = '0' + s.slice(4);
  return s;
}
