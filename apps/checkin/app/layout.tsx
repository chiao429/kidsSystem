import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '思麥特基地X夢夢基地｜報到系統',
  description: '報到資格驗證、報到課程管理、現場報到作業',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-[#f5f6f8] text-[#273142]">{children}</body>
    </html>
  );
}
