import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '思麥特基地X夢夢基地｜小組系統',
  description: '小組長期點名：出席、當天狀況、備註',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-[#f5f6f8] text-[#273142]">{children}</body>
    </html>
  );
}
