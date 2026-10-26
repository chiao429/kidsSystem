const path = require('path');

/**
 * registration 是同工端的統一入口（root zone）：自己處理 /login、/import、/staff、現場報名（/e/:id/onsite），
 * 其餘系統依路徑轉送到各自獨立部署的 app（目的地由環境變數指定，未設定的系統不轉送）。
 */
const zones = [
  ['/admin', process.env.ADMIN_ORIGIN],
  ['/checkin', process.env.CHECKIN_ORIGIN],
  ['/rollcall', process.env.ROLLCALL_ORIGIN],
  ['/data-tools', process.env.DATA_TOOLS_ORIGIN],
  ['/groups', process.env.SMALLGROUPS_ORIGIN],
].filter(([, origin]) => !!origin);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Docker 部署：輸出可獨立執行的 server（monorepo 需追蹤到 repo 根目錄的套件）
  output: 'standalone',
  transpilePackages: ['@kids/schema', '@kids/sheets-core', '@kids/auth', '@kids/ui', '@kids/registration-core'],
  experimental: {
    serverComponentsExternalPackages: ['mongodb'],
    outputFileTracingRoot: path.join(__dirname, '../..'),
  },
  // 家長頁已拆到 apps/parents（家長網址）：舊連結轉過去；現場報名（/e/:id/onsite）留在這裡
  async redirects() {
    const parent = (process.env.NEXT_PUBLIC_PARENT_URL ?? '').replace(/\/+$/, '');
    if (!parent) return [];
    return [
      { source: '/qr', destination: `${parent}/qr`, permanent: false },
      { source: '/privacy', destination: `${parent}/privacy`, permanent: false },
      { source: '/e/:eventId', destination: `${parent}/e/:eventId`, permanent: false },
      { source: '/e/:eventId/:page((?!onsite$).*)', destination: `${parent}/e/:eventId/:page`, permanent: false },
    ];
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
