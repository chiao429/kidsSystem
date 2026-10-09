import 'server-only';
import * as XLSX from 'xlsx';

type Cell = string | number;

function width(v: Cell): number {
  let w = 0;
  for (const ch of String(v ?? '')) w += /[⺀-￯]/.test(ch) ? 2.1 : 1.1;
  return w;
}

export function sheet(rows: Cell[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const cols = Math.max(0, ...rows.map((r) => r.length));
  ws['!cols'] = Array.from({ length: cols }, (_, c) => ({
    wch: Math.min(50, Math.max(6, ...rows.map((r) => width(r[c] ?? '')))),
  }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

export function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, '_').slice(0, 31) || 'Sheet';
  let n = 2;
  let out = base;
  while (used.has(out)) out = `${base.slice(0, 28)}_${n++}`;
  used.add(out);
  return out;
}

export function workbookResponse(sheets: { name: string; rows: Cell[][] }[], filename: string): Response {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, sheet(s.rows), safeSheetName(s.name, used));
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
