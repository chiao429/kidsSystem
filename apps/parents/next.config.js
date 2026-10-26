const path = require('path');

/**
 * 家長端：活動頁、報名、家長登入、報到 QR code、問卷、隱私權條款。
 * 獨立部署（自己的網址，不經統一入口），不需要 basePath；同工相關功能在 registration。
 */
/** 允許的 Server Action 來源（SITE_HOST，可逗號分隔） */
const allowedOrigins = (process.env.SITE_HOST ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker 部署：輸出可獨立執行的 server（monorepo 需追蹤到 repo 根目錄的套件）
  output: 'standalone',
  transpilePackages: ['@kids/schema', '@kids/sheets-core', '@kids/auth', '@kids/ui', '@kids/registration-core'],
  experimental: {
    serverComponentsExternalPackages: ['mongodb'],
    outputFileTracingRoot: path.join(__dirname, '../..'),
    ...(allowedOrigins.length ? { serverActions: { allowedOrigins } } : {}),
  },
};

module.exports = nextConfig;
