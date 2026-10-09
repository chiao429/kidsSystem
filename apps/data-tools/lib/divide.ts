import type { Kid } from './roster';

export interface DivideOptions {
  /** 每個組別的隊數 */
  teamCount: number;
  /** 小隊名稱前綴，例如 "一年級" → "一年級-1"；可用 {n} 代表編號 */
  pattern: string;
  /** 同組別的手足（如雙胞胎）分在同一隊 */
  keepSiblingsTogether: boolean;
}

export function teamName(pattern: string, n: number): string {
  const num = String(n).padStart(2, '0');
  return pattern.includes('{n}') ? pattern.replace('{n}', num) : `${pattern}${num}`;
}

/**
 * 分隊：盡量讓每隊人數、性別、學校平均。
 * 作法：依性別→學校排序後，蛇形（1,2,3,3,2,1…）分配；手足綁在一起時改為「放進目前人數最少的隊」。
 */
export function divide(kids: Kid[], opts: DivideOptions): Map<string, Kid[]> {
  const n = Math.max(1, Math.floor(opts.teamCount));
  const names = Array.from({ length: n }, (_, i) => teamName(opts.pattern, i + 1));
  const result = new Map<string, Kid[]>(names.map((name) => [name, []]));

  // 單位：一個人，或同家庭的一組手足
  const units: Kid[][] = [];
  if (opts.keepSiblingsTogether) {
    const byHousehold = new Map<string, Kid[]>();
    for (const k of kids) byHousehold.set(k.家庭ID, [...(byHousehold.get(k.家庭ID) ?? []), k]);
    units.push(...byHousehold.values());
  } else {
    units.push(...kids.map((k) => [k]));
  }

  const key = (u: Kid[]) => `${u[0].性別}|${u[0].學校}|${u[0].序號.padStart(6, '0')}`;
  units.sort((a, b) => b.length - a.length || key(a).localeCompare(key(b), 'zh-Hant'));

  if (units.every((u) => u.length === 1)) {
    units.forEach((u, i) => {
      const round = Math.floor(i / n);
      const pos = i % n;
      const idx = round % 2 === 0 ? pos : n - 1 - pos;
      result.get(names[idx])!.push(...u);
    });
  } else {
    for (const u of units) {
      const target = names.reduce((best, name) => {
        const a = result.get(name)!;
        const b = result.get(best)!;
        const gender = u[0].性別;
        const score = (list: Kid[]) => list.length * 10 + list.filter((k) => k.性別 === gender).length;
        return score(a) < score(b) ? name : best;
      }, names[0]);
      result.get(target)!.push(...u);
    }
  }
  return result;
}
