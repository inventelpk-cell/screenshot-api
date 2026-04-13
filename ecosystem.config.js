module.exports = {
  apps: [
    {
      name: 'screenshot-api',
      script: './dist/index.js',
      instances: 1, // Single instance — Puppeteer manages its own concurrency via the page pool
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '3G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      env_file: '.env',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      kill_timeout: 10000,
      listen_timeout: 10000,
      shutdown_with_message: true,
    },
  ],
};
