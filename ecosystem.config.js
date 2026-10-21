module.exports = {
  apps: [
    {
      name: 'ollama',
      script: 'ollama',
      args: 'serve',
      autorestart: true,
      watch: false,
      env: {
        OLLAMA_NUM_PARALLEL: '1',
        OLLAMA_MAX_LOADED_MODELS: '1',
        OLLAMA_KEEP_ALIVE: '0',
      },
    },
    {
      name: 'quote-app',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      // #[20260901-1100] P0-4：cluster 模式下 cron 调度器仅由实例 0 注册
      // （见 src/instrumentation.ts 的 NODE_APP_INSTANCE 守卫），多实例不会重复执行定时任务
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: './logs/pm2/err.log',
      out_file: './logs/pm2/out.log',
      log_file: './logs/pm2/combined.log',
      time: true,
    },
  ],
};
