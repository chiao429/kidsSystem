import 'server-only';
import * as XLSX from 'xlsx';

/** 產生 Excel 下載回應：第一張為資料，第二張為說明 */
export function xlsxResponse(filename: string, rows: (string | number)[][], notes: string[][], widths: number[]): Response {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(wb, ws, '資料');
  const help = XLSX.utils.aoa_to_sheet([['欄位', '說明'], ...notes]);
  help['!cols'] = [{ wch: 12 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, help, '說明');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
