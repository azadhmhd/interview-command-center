import type { NextConfig } from 'next';

const api = process.env.API_INTERNAL_URL || 'http://localhost:4000';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Same-origin API: the httpOnly session cookie never crosses origins and no token lives in JS.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
      ],
    }];
  },
};

export default config;
