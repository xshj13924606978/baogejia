/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: true,

  output: 'standalone',

  experimental: {},

  env: {},

  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tjbnjrcgmyiwudqptfhc.supabase.co',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  webpack: (config, { dev }) => {
    // 在开发环境使用相对路径，避免 Chrome 在 WSL 下因绝对路径
    // 抛出 "无法添加文件系统：<illegal path>" 错误
    if (dev) {
      config.output.devtoolModuleFilenameTemplate = '[resource-path]';
    }
    return config;
  },

  async headers() {
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || '';
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: allowedOrigin || 'http://localhost:3000' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version' },
          // 安全响应头
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
