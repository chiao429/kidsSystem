import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '思麥特基地X夢夢基地｜同工入口',
  description: '活動報名、報名資格判斷、報名資料管理',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-[#f5f6f8] text-[#273142]">{children}</body>
    </html>
  );
}
