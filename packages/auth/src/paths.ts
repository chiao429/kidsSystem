/** middleware 寫入目前路徑的 request header */
export const PATHNAME_HEADER = 'x-pathname';

/**
 * 只接受本站路徑（以單一 / 開頭），防止登入後被導到外部網站。
 * 拒絕 //host、/\host、含 scheme、含控制字元的值，以及登入頁本身；不合法回傳空字串。
 */
export function safeNext(next: string | null | undefined): string {
  const v = String(next ?? '').trim();
  if (!v || v.length > 2000) return '';
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return '';
  if (/[\u0000-\u001f\\]/.test(v) || v.includes('://')) return '';
  if (/(^|\/)login(\?|$)/.test(v)) return '';
  return v;
}
