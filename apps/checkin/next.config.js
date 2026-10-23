const path = require('path');

const basePath = '/checkin';

/** 允許經由統一入口轉送的 Server Action 來源（SITE_HOST，可逗號分隔） */
const allowedOrigins = (process.env.SITE_HOST ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker 部署：輸出可獨立執行的 server（monorepo 需追蹤到 repo 根目錄的套件）
  output: 'standalone',
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  transpilePackages: ['@kids/schema', '@kids/sheets-core', '@kids/auth', '@kids/ui'],
  experimental: {
    serverComponentsExternalPackages: ['mongodb'],
    outputFileTracingRoot: path.join(__dirname, '../..'),
    ...(allowedOrigins.length ? { serverActions: { allowedOrigins } } : {}),
  },
};

module.exports = nextConfig;
