/** @type {import('next').NextConfig} */
const nextConfig = {
  /* 配置选项 */
  reactStrictMode: true,
  swcMinify: true,
  
  // 忽略 TypeScript 错误
  typescript: {
    // 在生产构建时忽略 TypeScript 错误
    ignoreBuildErrors: true,
  },
  
  // 忽略 ESLint 错误
  eslint: {
    // 在生产构建时忽略 ESLint 错误
    ignoreDuringBuilds: true,
  },
  
  // 实验性功能
  experimental: {
    // 启用 App Router
    appDir: true,
  },
  
  // 环境变量
  env: {
    // 可以在这里定义环境变量
  },
  
  // 图片优化配置
  images: {
    domains: ['localhost', 'tjbnjrcgmyiwudqptfhc.supabase.co'],
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
