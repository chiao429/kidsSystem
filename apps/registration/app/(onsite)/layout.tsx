import { Nunito } from 'next/font/google';
import { BrandFooter } from '@kids/ui';
import { Sparkle } from '@kids/registration-core/components/Rainbow';
import '@kids/registration-core/theme-rainbow.css';

export const dynamic = 'force-dynamic';

const rounded = Nunito({ subsets: ['latin'], weight: ['600', '700', '800', '900'], variable: '--font-rounded', display: 'swap' });

/** 同工在報到現場使用的現場報名頁：沿用家長端的報名表樣式（.theme-rainbow） */
export default function OnsiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`theme-rainbow flex min-h-screen flex-col ${rounded.variable}`}>
      <div className="rb-sky" aria-hidden>
        <span className="rb-cloud rb-cloud-1" />
        <span className="rb-cloud rb-cloud-2" />
        <Sparkle className="rb-sparkle rb-sparkle-1" />
      </div>
      <main className="relative z-20 mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 pb-6 pt-6">{children}</main>
      <BrandFooter className="relative z-10" />
    </div>
  );
}
