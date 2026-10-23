const PREFIX = {
  家庭ID: 'H',
  成員ID: 'M',
  報名ID: 'R',
  報到ID: 'C',
  小隊成員ID: 'T',
  分組ID: 'G',
  分組成員ID: 'T',
  時段ID: 'S',
  點名ID: 'A',
  問卷ID: 'Q',
  回覆ID: 'QR',
  日誌ID: 'L',
} as const;

/** 產生不需中央計數器的唯一 ID，例：R-20261009-K3F9Q2 */
export function newId(column: keyof typeof PREFIX, now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0');
  return `${PREFIX[column]}-${date}-${rand}`;
}

/** 台北時間 "YYYY-MM-DD HH:mm:ss"（可直接字串排序） */
export function nowString(now = new Date()): string {
  const t = new Date(now.getTime() + 8 * 3600_000).toISOString();
  return `${t.slice(0, 10)} ${t.slice(11, 19)}`;
}
