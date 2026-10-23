const path = require('path');

/**
 * registration 是統一入口（root zone）：自己處理 /、/e/...、/login、/import、/staff，
 * 其餘系統依路徑轉送到各自獨立部署的 app（目的地由環境變數指定，未設定的系統不轉送）。
 */
const zones = [
  ['/admin', process.env.ADMIN_ORIGIN],
  ['/checkin', process.env.CHECKIN_ORIGIN],
  ['/rollcall', process.env.ROLLCALL_ORIGIN],
  ['/data-tools', process.env.DATA_TOOLS_ORIGIN],
].filter(([, origin]) => !!origin);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker 部署：輸出可獨立執行的 server（monorepo 需追蹤到 repo 根目錄的套件）
  output: 'standalone',
  transpilePackages: ['@kids/schema', '@kids/sheets-core', '@kids/auth', '@kids/ui'],
  experimental: {
    serverComponentsExternalPackages: ['mongodb'],
    outputFileTracingRoot: path.join(__dirname, '../..'),
  },
  async rewrites() {
    return {
      // 目的 app 設有相同的 basePath，因此轉送時保留路徑前綴
      beforeFiles: zones.flatMap(([path, origin]) => {
        const target = origin.replace(/\/+$/, '');
        return [
          { source: path, destination: `${target}${path}` },
          { source: `${path}/:path*`, destination: `${target}${path}/:path*` },
        ];
      }),
    };
  },
};

module.exports = nextConfig;
