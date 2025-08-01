module.exports = {
  apps: [
    {
      name: "hono-backend",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
