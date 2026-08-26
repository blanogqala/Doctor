/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  /**
   * Local/dev: browser talks to same origin (`/api/*`) so HttpOnly session cookies
   * work on practice hosts like eastern-cape.localhost:3000.
   * Staging/production: set NEXT_PUBLIC_API_URL to the Render origin instead.
   */
  async rewrites() {
    const target = (process.env.API_REWRITE_TARGET || 'http://127.0.0.1:3001').replace(
      /\/$/,
      ''
    );
    return [
      { source: '/api/:path*', destination: `${target}/api/:path*` },
      { source: '/health', destination: `${target}/health` },
      { source: '/health/:path*', destination: `${target}/health/:path*` },
    ];
  },
};

module.exports = nextConfig;
