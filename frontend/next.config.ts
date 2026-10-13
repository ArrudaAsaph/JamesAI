import type { NextConfig } from 'next';

const config: NextConfig = {
  async rewrites() {
    const backend = process.env.BACKEND_URL || 'http://127.0.0.1:3000';
    return [{ source: '/api/:path*', destination: `${backend}/:path*` }];
  },
};
export default config;
