// Only load bundle-analyzer when ANALYZE is enabled — the plugin injects
// webpack config even when disabled, which triggers "Webpack is configured
// while Turbopack is not" warnings during turbo dev.
const withBundleAnalyzer =
  process.env.ANALYZE === 'true'
    ? require('@next/bundle-analyzer')({ enabled: true })
    : (config) => config;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Suppress Turbopack TP1004/TP1005 lint warnings for server-side dynamic fs/child_process usage
  // Next.js 14 uses "experimental.serverComponentsExternalPackages"
  // ("serverExternalPackages" is only valid in Next.js 15+)
  experimental: {
    serverComponentsExternalPackages: [
      'openai',
      'zod',
      'zod-to-json-schema',
      'playwright-core',
      'node-cron',
      'sharp',
    ],
  },
};

nextConfig.headers = async () => [
  {
    source: '/(.*)',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
    ],
  },
  {
    source: '/api/(.*)',
    headers: [
      { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
    ],
  },
];

// Only apply webpack watchOptions when NOT using Turbopack (dev:webpack fallback).
// Keeping this out of the base config avoids Turbopack's "Webpack is configured" warning
// and the Watchpack config-change detection loop that causes infinite restarts.
if (process.env.NEXT_USE_WEBPACK) {
  nextConfig.webpack = (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.next/**',
        '**/.git/**',
        '**/.cursor/**',
        '**/.history/**',
        '**/projects/**',
        '**/skills/**',
        '**/tools/**',
        '**/database/**',
        '**/agents/**',
        '**/.workspaces/**',
        '**/connectors/**',
      ],
    };
    return config;
  };
}

module.exports = withBundleAnalyzer(nextConfig);
