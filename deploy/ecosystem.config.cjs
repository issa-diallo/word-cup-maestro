module.exports = {
  apps: [
    {
      name: "worldcup-api",
      script: "npm",
      args: "start",
      cwd: "/var/www/worldcup",
      exec_mode: "fork",
      instances: 1,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      max_memory_restart: "1500M",
      time: true,
    },
  ],
};
