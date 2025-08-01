// apps/server/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'hono-backend',      // The name of your application
      script: 'dist/index.js',  // The entry point of your built app
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};