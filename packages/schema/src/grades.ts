/** 年級的合法值與排序（報名表單、分組、分隊共用） */
export const GRADE_OPTIONS = [
  '未就學', '小班', '中班', '大班',
  '一年級', '二年級', '三年級', '四年級', '五年級', '六年級',
  '國一', '國二', '國三',
] as const;

export type Grade = (typeof GRADE_OPTIONS)[number];

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

/** 標準化成 GRADE_OPTIONS 之一 */
export function normalizeGrade(input: string | undefined | null): Grade {
  const s = String(input ?? '').trim();
  if (s.includes('小班')) return '小班';
  const rank = gradeRank(s);
  if (rank === -3) return '未就學';
  if (rank === -2) return '中班';
  if (rank === -1) return '大班';
  return GRADE_OPTIONS[rank + 3] as Grade;
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
