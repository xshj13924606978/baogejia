/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: true,

  output: 'standalone',

  // standalone 模式下，Tesseract.js 的 worker 脚本和 wasm core 通过运行时路径加载，
  // 文件追踪（@vercel/nft）无法识别 new Worker(workerPath) 的字符串路径，需显式包含
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/tesseract.js/src/worker-script/**/*',
      './node_modules/tesseract.js-core/**/*',
    ],
  },

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

  // Turbopack 兼容：空配置使用默认 Turbopack 行为
  turbopack: {},

  webpack: (config, { dev }) => {
    if (dev) {
      // 在 WSL 下使用相对路径，避免 Chrome 抛出 "无法添加文件系统：<illegal path>"
      config.output.devtoolModuleFilenameTemplate = '[resource-path]';
      config.output.devtoolFallbackModuleFilenameTemplate = '[resource-path]?[hash]';
      // eval-cheap-module-source-map 不生成绝对路径的 source map，彻底避免 WSL 路径问题
      config.devtool = 'eval-cheap-module-source-map';

      // 忽略非源码目录的文件变更，防止无意义的 Fast Refresh 频繁触发
      config.watchOptions = {
        ignored: [
          '**/node_modules',
          '**/.git',
          '**/.*/',
          '**/logs/**',
          '**/coverage/**',
          '**/reports/**',
          '**/assets/**',
          '**/database/**',
          '**/docs/**',
          '**/scripts/**',
          '**/projects/**',
          '**/public/**',
          '**/ssl/**',
          '**/patches/**',
          '**/*.md',
          '**/*.log',
        ],
        // WSL 下文件系统监视不可靠，使用轮询方式监视文件变更
        poll: 1000,
        aggregateTimeout: 300,
      };
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
