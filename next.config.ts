import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Strict mode for React 19
  reactStrictMode: true,

  typedRoutes: true,

  // SportMonks CDN hosts team crests, country flags and player photos.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.sportmonks.com' },
    ],
  },

  // Bundle _data folder so CSV files are accessible in Vercel serverless functions
  outputFileTracingIncludes: {
    '**': ['_data/**'],
  },

  // URL nesting: matchdays and players moved under /campionato.
  // Permanent redirects keep old bookmarks/external links working.
  async redirects() {
    return [
      { source: '/matchdays',           destination: '/campionato/giornate',         permanent: true },
      { source: '/matchdays/:path*',    destination: '/campionato/giornate/:path*',  permanent: true },
      { source: '/players',             destination: '/campionato/giocatori',        permanent: true },
      { source: '/players/:path*',      destination: '/campionato/giocatori/:path*', permanent: true },
      // /pool removed — the FotMob/SofaScore URL-scrape import is gone and the
      // global pool view duplicated /campionato/giocatori.
      { source: '/pool',                destination: '/campionato/giocatori',        permanent: true },
      { source: '/pool/:path*',         destination: '/campionato/giocatori',        permanent: true },
    ]
  },
}

export default nextConfig
