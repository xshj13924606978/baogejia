/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: true,

  output: 'standalone',

  // 隔离 dev 与生产构建产物：
  // - dev（Turbopack）使用 .next（NODE_ENV=development）
  // - 生产构建使用 .next-production（build.sh 内显式 NODE_ENV=production）
  // 防止 Turbopack dev 启动重建 .next 覆盖生产 standalone 产物
  distDir: process.env.NODE_ENV === 'production' ? '.next-production' : '.next',

  // standalone 模式下，Tesseract.js 的 worker 脚本、wasm core 及语言包通过运行时路径加载，
  // 文件追踪（@vercel/nft）无法识别 new Worker(workerPath) 的字符串路径，需显式包含：
  // 1. tesseract.js 完整包（worker-script 内部还 require src/constants、src/utils 等目录）
  // 2. tesseract.js-core（wasm 核心）
  // 3. tesseract.js 的全部运行时依赖（regenerator-runtime、is-url、node-fetch、bmp-js、zlibjs 等）
  // 4. 中文/英文语言包（*.traineddata）
  outputFileTracingIncludes: {
    '/api/**/*': [
      './node_modules/tesseract.js/**/*',
      './node_modules/tesseract.js-core/**/*',
      './node_modules/bmp-js/**/*',
      './node_modules/idb-keyval/**/*',
      './node_modules/is-url/**/*',
      './node_modules/node-fetch/**/*',
      './node_modules/opencollective-postinstall/**/*',
      './node_modules/regenerator-runtime/**/*',
      './node_modules/wasm-feature-detect/**/*',
      './node_modules/zlibjs/**/*',
      './*.traineddata',
    ],
  },

  // Next.js 16：Route Handler 请求体缓冲上限默认 10MB，超限会静默截断请求体（#20260823-1830/#20260823-1900）
  // 实测上传 12.47MB 被截成 10MB（storage 对象与返回 size 均只到 10MB）。调大至 500MB 以支持最大 500MB 上传，
  // 留足 multipart 边界与表单字段开销；serverActions.bodySizeLimit 同步调大（Server Action 请求体上限）。
  experimental: {
    proxyClientMaxBodySize: '500mb',
    // Server Action 请求体大小上限（Next.js 16 需放 experimental 下，默认 1MB）
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },

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
      // 注：不再自定义 config.devtool —— Next.js 16 会强制回退到 'false' 并产生警告，
      // 使用默认 devtool 即可（devtoolModuleFilenameTemplate 仍生效以规避 WSL 路径问题）

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
