/** @type {import('next').NextConfig} */
const nextConfig = {
  /* 配置选项 */
  reactStrictMode: true,

  // 输出配置
  output: 'standalone',

  // 实验性配置（暂留空）
  experimental: {},

  // 环境变量
  env: {
    // 可以在这里定义环境变量
  },

  // 图片优化配置
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

  // API 路由配置
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
