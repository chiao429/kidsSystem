import clsx from 'clsx';
import sanitize from 'sanitize-html';
import { richTextClass, toRichHtml } from './rich-text-format';

/** 顏色：#hex、rgb()/rgba()、英文色名 */
const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\)$/i, /^[a-z]+$/i];

/**
 * 伺服器端專用（sanitize-html 體積大，不要從 client component import）：
 * 富文字只保留編輯器會產生的標籤，連結限 http/https/mailto/tel，並一律另開視窗。
 */
export function sanitizeRichText(value: string | undefined): string {
  const html = sanitize(toRichHtml(value), {
    allowedTags: [
      'p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'sub', 'sup',
      'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'hr',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    ],
    // target/rel 由下方 transformTags 補上（使用者輸入的值會被覆蓋），仍需列在白名單才不會被濾掉
    allowedAttributes: {
      '*': ['style'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'width', 'height'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
    },
    // 只保留文字外觀相關的樣式；字型、定位、邊界等一律濾掉，避免破版或隱藏內容
    allowedStyles: {
      '*': {
        color: COLOR,
        'background-color': COLOR,
        'font-size': [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
        'font-weight': [/^(bold|bolder|normal|[1-9]00)$/],
        'font-style': [/^(italic|normal)$/],
        'text-decoration': [/^(underline|line-through|none)( solid)?$/],
        'text-align': [/^(left|right|center|justify)$/],
      },
      td: { 'vertical-align': [/^(top|middle|bottom)$/], width: [/^\d+(\.\d+)?%$/] },
      th: { 'vertical-align': [/^(top|middle|bottom)$/], width: [/^\d+(\.\d+)?%$/] },
      table: { width: [/^\d+(\.\d+)?%$/] },
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    // 圖片只接受外部網址（不允許 data: 內嵌，避免把大檔塞進資料表）
    allowedSchemesByTag: { img: ['http', 'https'] },
    transformTags: {
      div: 'p',
      // 家長頁的標題層級從 h2 開始（h1 是頁面標題）
      h1: 'h2',
      h4: 'h3',
      a: sanitize.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  }).trim();
  // 只剩空段落／換行（例如編輯器清空後的 <p><br></p>）視為沒有內容
  return /<img\b/.test(html) || html.replace(/<[^>]*>|&nbsp;|\s/g, '') ? html : '';
}

/** 顯示活動說明等富文字（相容舊的純文字資料） */
export function RichText({ html, className }: { html: string | undefined; className?: string }) {
  const clean = sanitizeRichText(html);
  if (!clean) return null;
  return <div className={clsx('ui-rich-text', richTextClass, className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}
