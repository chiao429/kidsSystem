/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kids/schema', '@kids/sheets-core'],
};

module.exports = nextConfig;
