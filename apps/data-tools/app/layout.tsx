import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '資料整理',
  description: '分組、手足/家庭整理、分隊、名單匯出',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
