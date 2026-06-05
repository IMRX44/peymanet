import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // TipTap / ProseMirror are ESM; keep server components lean.
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  // Contract content can be large; allow bigger payloads on API routes via route config.
};

export default withNextIntl(nextConfig);
