/** 富文字共用的格式工具（不依賴 sanitize-html，前端編輯器也可以 import） */

/** 是否已經是 HTML（舊資料是純文字，用換行分段） */
export function isHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(value);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 舊的純文字說明轉成 HTML：每一行一個段落（編輯器套用標題、清單時才會只作用在那一行） */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
}

/** 不論新舊資料，一律轉成 HTML（尚未消毒） */
export function toRichHtml(value: string | undefined): string {
  const v = value ?? '';
  return isHtml(v) ? v : plainTextToHtml(v);
}

/** 本系統富文字樣式（Tailwind 沒裝 typography，直接用子元素選擇器） */
export const richTextClass =
  'text-sm leading-6 text-gray-700 [&_a]:text-[#315bc7] [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-gray-200 [&_blockquote]:pl-3 [&_blockquote]:text-gray-600 [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-gray-900 [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:font-semibold [&_h3]:text-gray-900 [&_hr]:my-3 [&_img]:inline-block [&_img]:h-auto [&_img]:max-w-full [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5' +
  // 表格：手機上太寬時可左右捲動
  ' [&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_td]:min-w-16 [&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1 [&_td]:align-top [&_th]:min-w-16 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold';
