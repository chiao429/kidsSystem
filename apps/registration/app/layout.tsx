import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '報名系統',
  description: '活動報名、報名資格判斷、報名資料管理',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
