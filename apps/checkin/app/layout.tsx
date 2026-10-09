import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '報到系統',
  description: '報到資格驗證、報到課程管理、現場報到作業',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
