/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@easyevent/schema', '@easyevent/sheets-core'],
};

module.exports = nextConfig;
