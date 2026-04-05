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
      instances: 'max',
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/pm2/err.log',
      out_file: './logs/pm2/out.log',
      log_file: './logs/pm2/combined.log',
      time: true,
    },
  ],
};
