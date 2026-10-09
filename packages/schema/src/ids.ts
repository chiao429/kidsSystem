const PREFIX = {
  家庭ID: 'H',
  成員ID: 'M',
  報名ID: 'R',
  報到ID: 'C',
  小隊成員ID: 'T',
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

export function nowString(now = new Date()): string {
  return now.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}
