/** 家長端（Rainbow 主題）的裝飾圖形：純 SVG，沒有外部圖檔 */

/** 黃色四角星 */
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 0c.9 6.6 4.4 10.6 12 12-7.6 1.4-11.1 5.4-12 12-.9-6.6-4.4-10.6-12-12C7.6 10.6 11.1 6.6 12 0Z" fill="#fae300" />
    </svg>
  );
}
