/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@kids/schema', '@kids/sheets-core', '@kids/auth', '@kids/ui'],
};

module.exports = nextConfig;
