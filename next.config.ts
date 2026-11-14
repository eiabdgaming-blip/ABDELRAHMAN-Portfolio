import type { NextConfig } from 'next'

const config: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }],
      },
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      {
        source: '/api/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/admin/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]
  },
}

export default config
