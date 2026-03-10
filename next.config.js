const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Suppress Turbopack TP1004/TP1005 lint warnings for server-side dynamic fs/child_process usage
  serverExternalPackages: [
    'openai',
    'zod',
    'zod-to-json-schema',
  ],
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
