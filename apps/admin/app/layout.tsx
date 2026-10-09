import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '系統管理後台',
  description: '活動與規則設定、帳號、問卷、報表',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
