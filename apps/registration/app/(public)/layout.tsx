import Link from 'next/link';
import { Nunito } from 'next/font/google';
import { BrandFooter } from '@kids/ui';
import { Sparkle } from '@/components/Rainbow';
import './theme-rainbow.css';

export const dynamic = 'force-dynamic';

/** 圓體英數字；中文沒有對應字形，會落到系統字型 */
const rounded = Nunito({ subsets: ['latin'], weight: ['600', '700', '800', '900'], variable: '--font-rounded', display: 'swap' });

/** 家長端版面：與後台／同工系統不同，採用 .theme-rainbow（粉彩天空、糖果色按鈕、大圓角） */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`theme-rainbow ${rounded.variable}`}>
      {/* 天空裝飾：雲朵與星星，只出現在頁面頂端 */}
      <div className="rb-sky" aria-hidden>
        <span className="rb-cloud rb-cloud-1" />
        <span className="rb-cloud rb-cloud-2" />
        <span className="rb-cloud rb-cloud-3" />
        <Sparkle className="rb-sparkle rb-sparkle-1" />
        <Sparkle className="rb-sparkle rb-sparkle-2" />
        <Sparkle className="rb-sparkle rb-sparkle-3" />
      </div>
      <header className="relative z-10">
        <div className="mx-auto flex h-20 max-w-2xl items-center px-4">
          <Link href="/" className="rb-wordmark">
            活動報名
          </Link>
        </div>
      </header>
      <main className="relative z-10 mx-auto max-w-2xl space-y-5 px-4 pb-6 pt-2 sm:pt-6">{children}</main>
      <BrandFooter className="relative z-10 pb-28" />
    </div>
  );
}
